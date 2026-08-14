import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCompanyAddresses, createCompanyAddress, updateCompanyAddress, deleteCompanyAddress, setCompanyAddressDefault } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, CheckCircle2, Trash2, Edit } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

const CompanyAddresses = () => {
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ title: "", address_text: "", is_default: false });

    const { data: addresses = [], isLoading } = useQuery({
        queryKey: ["companyAddresses"],
        queryFn: fetchCompanyAddresses
    });

    const mutationCreate = useMutation({
        mutationFn: createCompanyAddress,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["companyAddresses"] });
            toast.success("Address added successfully");
            setIsDialogOpen(false);
        },
        onError: (err) => toast.error(err.message)
    });

    const mutationUpdate = useMutation({
        mutationFn: ({ id, body }) => updateCompanyAddress(id, body),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["companyAddresses"] });
            toast.success("Address updated successfully");
            setIsDialogOpen(false);
        },
        onError: (err) => toast.error(err.message)
    });

    const mutationDelete = useMutation({
        mutationFn: deleteCompanyAddress,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["companyAddresses"] });
            toast.success("Address deleted successfully");
        },
        onError: (err) => toast.error(err.message)
    });

    const mutationSetDefault = useMutation({
        mutationFn: setCompanyAddressDefault,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["companyAddresses"] });
            toast.success("Default address updated");
        },
        onError: (err) => toast.error(err.message)
    });

    const handleOpenDialog = (address = null) => {
        if (address) {
            setEditingId(address.id);
            setFormData({ title: address.title, address_text: address.address_text, is_default: address.is_default });
        } else {
            setEditingId(null);
            setFormData({ title: "", address_text: "", is_default: false });
        }
        setIsDialogOpen(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.title || !formData.address_text) {
            toast.error("Please fill all required fields");
            return;
        }
        if (editingId) {
            mutationUpdate.mutate({ id: editingId, body: formData });
        } else {
            mutationCreate.mutate(formData);
        }
    };

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Company Addresses</h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Manage registered offices, plants, and other dispatch locations.
                    </p>
                </div>
                <Button onClick={() => handleOpenDialog()}>
                    <Plus className="mr-2 h-4 w-4" /> Add Address
                </Button>
            </div>

            {isLoading ? (
                <div className="text-center py-10 text-muted-foreground">Loading addresses...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {addresses.map(addr => (
                        <div key={addr.id} className="relative bg-card text-card-foreground rounded-xl border shadow-sm p-5 flex flex-col h-full">
                            {addr.is_default && (
                                <div className="absolute top-4 right-4 bg-green-500/10 text-green-600 px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5">
                                    <CheckCircle2 size={14} /> Default
                                </div>
                            )}
                            <h3 className="font-semibold text-lg pr-20">{addr.title}</h3>
                            <pre className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap font-sans leading-relaxed flex-1">
                                {addr.address_text}
                            </pre>
                            <div className="flex gap-2 mt-6 pt-4 border-t border-border">
                                <Button variant="outline" size="sm" onClick={() => handleOpenDialog(addr)}>
                                    <Edit className="h-4 w-4 mr-2" /> Edit
                                </Button>
                                {!addr.is_default && (
                                    <Button variant="outline" size="sm" onClick={() => mutationSetDefault.mutate(addr.id)}>
                                        Set Default
                                    </Button>
                                )}
                                <Button variant="destructive" size="sm" onClick={() => {
                                    if (confirm("Are you sure you want to delete this address?")) {
                                        mutationDelete.mutate(addr.id);
                                    }
                                }}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingId ? "Edit Address" : "Add Address"}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label>Title (e.g. Regd. Office - Nangal Jarialan) *</Label>
                            <Input
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                placeholder="Enter a descriptive title"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Full Address Text *</Label>
                            <Textarea
                                value={formData.address_text}
                                onChange={e => setFormData({ ...formData, address_text: e.target.value })}
                                placeholder="Enter the complete address format to display in invoices"
                                className="min-h-[120px]"
                                required
                            />
                            <p className="text-xs text-muted-foreground">This text will be printed exactly as entered on the invoice.</p>
                        </div>
                        {!editingId && (
                            <div className="flex items-center space-x-2 pt-2">
                                <Switch
                                    checked={formData.is_default}
                                    onCheckedChange={c => setFormData({ ...formData, is_default: c })}
                                    id="default-mode"
                                />
                                <Label htmlFor="default-mode">Set as default address</Label>
                            </div>
                        )}
                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={mutationCreate.isPending || mutationUpdate.isPending}>
                                Save Address
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default CompanyAddresses;
