import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr } from "@/lib/format";
import { fetchClients, createClient, deleteClient } from "@/lib/api";
import { toast } from "sonner";
import { MapPin, Building2, Trash2 } from "lucide-react";

const Clients = () => {
    const qc = useQueryClient();

    const { data: clients = [], isLoading } = useQuery({
        queryKey: ["clients"],
        queryFn: fetchClients,
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: ["clients"] });
    const createMutation = useMutation({ mutationFn: createClient, onSuccess: invalidate });
    const deleteMutation = useMutation({ mutationFn: deleteClient, onSuccess: invalidate });

    const [open, setOpen] = useState(false);
    const [formData, setFormData] = useState({ name: "", location: "" });

    const groups = useMemo(() => {
        const byLocation = new Map();
        clients.forEach((c) => {
            const list = byLocation.get(c.location) || [];
            list.push(c);
            byLocation.set(c.location, list);
        });
        return Array.from(byLocation.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [clients]);

    const handleAddClient = async () => {
        if (!formData.name || !formData.location) return;
        try {
            await createMutation.mutateAsync({ name: formData.name, location: formData.location });
            toast.success("Client added");
            setFormData({ name: "", location: "" });
            setOpen(false);
        } catch (e) {
            toast.error(e.message);
        }
    };

    const handleDelete = async (clientId) => {
        try {
            await deleteMutation.mutateAsync(clientId);
            toast.success("Client deleted");
        } catch (e) {
            toast.error(e.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-end justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Clients</h2>
                    <p className="text-sm text-muted-foreground mt-1">All clients grouped by location.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Clients</div>
                        <div className="text-2xl font-bold text-foreground">{clients.length}</div>
                    </div>
                    <Button onClick={() => setOpen(true)}>+ Add Client</Button>
                </div>
            </div>

            {isLoading && <p className="text-muted-foreground text-sm">Loading clients...</p>}

            {groups.map(([location, list]) => (
                <Card key={location} className="shadow-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-border bg-muted/40 flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-accent" />
                        <h3 className="font-semibold text-foreground">{location}</h3>
                        <span className="text-xs text-muted-foreground">· {list.length} client(s)</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
                        {list.map((c) => (
                            <div key={c.id} className="rounded-xl border border-border bg-card p-4 hover:shadow-elegant transition-shadow relative">
                                <button onClick={() => handleDelete(c.id)}
                                    className="absolute top-2 right-2 text-red-500 hover:text-red-700">
                                    <Trash2 size={16} />
                                </button>
                                <div className="flex items-start gap-3">
                                    <div className="h-10 w-10 rounded-lg bg-gradient-steel grid place-items-center text-steel-foreground">
                                        <Building2 className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-foreground truncate">{c.name}</div>
                                        <div className="text-xs text-muted-foreground">{c.order_count ?? 0} order(s)</div>
                                    </div>
                                </div>
                                <div className="mt-3 pt-3 border-t border-border flex items-baseline justify-between">
                                    <span className="text-xs text-muted-foreground">Total purchases</span>
                                    <span className="font-bold text-primary">{inr(c.total_purchases ?? 0)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            ))}

            {!isLoading && groups.length === 0 && (
                <Card className="p-12 text-center shadow-card">
                    <p className="text-muted-foreground">No clients yet. Click <b>+ Add Client</b> to get started.</p>
                </Card>
            )}

            {/* Add Client Dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Add Client</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1">
                            <Label>Client Name</Label>
                            <Input placeholder="Client Name" value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <Label>Location</Label>
                            <Input placeholder="Location" value={formData.location}
                                onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddClient} disabled={createMutation.isPending}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Clients;
