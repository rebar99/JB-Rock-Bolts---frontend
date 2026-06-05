import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { fetchInventory, createProduct, updateProduct } from "@/lib/api";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Package2 } from "lucide-react";

const STATUS_MAP = {
    "In Stock": "InStock",
    "Low Stock": "Low",
    "Out of Stock": "Out",
};
const REVERSE_STATUS = { InStock: "In Stock", Low: "Low Stock", Out: "Out of Stock" };

const Inventory = () => {
    const qc = useQueryClient();

    const { data: products = [], isLoading } = useQuery({
        queryKey: ["inventory"],
        queryFn: fetchInventory,
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: ["inventory"] });
    const createMutation = useMutation({ mutationFn: createProduct, onSuccess: invalidate });
    const updateMutation = useMutation({ mutationFn: ({ id, body }) => updateProduct(id, body), onSuccess: invalidate });

    const [editingProduct, setEditingProduct] = useState(null);
    const [formData, setFormData] = useState({ name: "", quantity: "", status: "In Stock" });

    const sorted = [...products].sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0));
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];

    const stockBadgeStatus = (status) => {
        if (status === "Out of Stock") return "Out";
        if (status === "Low Stock") return "Low";
        return "InStock";
    };

    const handleEdit = (p) => {
        setEditingProduct(p);
        setFormData({ name: p.name, quantity: p.quantity, status: p.status });
    };

    const handleSave = async () => {
        try {
            if (editingProduct === "new") {
                if (!formData.name) { toast.error("Product name required"); return; }
                await createMutation.mutateAsync({ name: formData.name, quantity: Number(formData.quantity || 0), status: formData.status });
                toast.success("Product added");
            } else {
                await updateMutation.mutateAsync({ id: editingProduct.id, body: { quantity: Number(formData.quantity), status: formData.status } });
                toast.success("Product updated");
            }
            setEditingProduct(null);
        } catch (e) {
            toast.error(e.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Inventory</h2>
                    <p className="text-sm text-muted-foreground">Current stock levels for all JB Rock Bolts products.</p>
                </div>
                <Button onClick={() => { setEditingProduct("new"); setFormData({ name: "", quantity: "", status: "In Stock" }); }}>
                    + Add Product
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-5 border-l-4 border-l-green-500">
                    <div className="flex gap-3">
                        <TrendingUp />
                        <div>
                            <div className="text-xs">Most Selling</div>
                            <div className="font-semibold">{top?.name ?? "—"}</div>
                            <div className="text-xs">{top?.sales_count ?? 0} orders</div>
                        </div>
                    </div>
                </Card>
                <Card className="p-5 border-l-4 border-l-red-500">
                    <div className="flex gap-3">
                        <TrendingDown />
                        <div>
                            <div className="text-xs">Least Selling</div>
                            <div className="font-semibold">{bottom?.name ?? "—"}</div>
                            <div className="text-xs">{bottom?.sales_count ?? 0} orders</div>
                        </div>
                    </div>
                </Card>
                <Card className="p-5 border-l-4 border-l-blue-500">
                    <div className="flex gap-3">
                        <Package2 />
                        <div>
                            <div className="text-xs">Total SKUs</div>
                            <div className="text-xl font-bold">{products.length}</div>
                        </div>
                    </div>
                </Card>
            </div>

            <Card>
                <div className="px-5 py-4 border-b">
                    <h3 className="font-semibold">Stock Levels</h3>
                </div>
                <table className="w-full text-sm">
                    <thead>
                        <tr>
                            <th className="text-left px-5 py-3">Product</th>
                            <th className="text-right px-5 py-3">Quantity</th>
                            <th className="text-right px-5 py-3">Sales</th>
                            <th className="text-left px-5 py-3">Status</th>
                            <th className="text-center px-5 py-3">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading && (
                            <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>
                        )}
                        {products.map((p) => (
                            <tr key={p.id} className="border-t">
                                <td className="px-5 py-3">{p.name}</td>
                                <td className="px-5 py-3 text-right">{p.quantity}</td>
                                <td className="px-5 py-3 text-right">{p.sales_count ?? 0}</td>
                                <td className="px-5 py-3">
                                    <StatusBadge status={stockBadgeStatus(p.status)} label={p.status} />
                                </td>
                                <td className="px-5 py-3 text-center">
                                    <Button size="sm" onClick={() => handleEdit(p)}>Edit</Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

            {/* Add / Edit Modal */}
            <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{editingProduct === "new" ? "Add Product" : "Edit Product"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1">
                            <Label>Product Name</Label>
                            <Input placeholder="Product Name" value={formData.name}
                                disabled={editingProduct !== "new"}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <Label>Quantity</Label>
                            <Input type="number" placeholder="Quantity" value={formData.quantity}
                                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <Label>Status</Label>
                            <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="In Stock">In Stock</SelectItem>
                                    <SelectItem value="Low Stock">Low Stock</SelectItem>
                                    <SelectItem value="Out of Stock">Out of Stock</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingProduct(null)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Inventory;
