import sys

def patch_page(filepath, is_wo=False):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    var_name = "wo" if is_wo else "po"
    title_short = "WO" if is_wo else "PO"
    
    # 1. Add State
    if "const [increaseQtyItem, setIncreaseQtyItem] = useState(null);" not in content:
        state_str = "    const [increaseQtyItem, setIncreaseQtyItem] = useState(null);\n    const [increaseQtyItems, setIncreaseQtyItems] = useState([]);\n    const [increaseQtyReason, setIncreaseQtyReason] = useState('');\n"
        import re
        content = re.sub(r'(const \[dialogOpen, setDialogOpen\] = useState\(false\);)', r'\1\n' + state_str, content, count=1)
        
    # 2. Add Mutation & handlers
    if "const increaseQtyMutation" not in content:
        mutation_fn = f"increase{title_short}Quantity"
        handler_str = f"""
    const increaseQtyMutation = useMutation({{
        mutationFn: ({{ id, data }}) => {mutation_fn}(id, data),
        onSuccess: () => {{
            invalidate();
            setIncreaseQtyItem(null);
            toast.success("{title_short} Quantity Updated successfully!");
        }},
        onError: (e) => toast.error(e.message || "Failed to update quantity")
    }});

    const openIncreaseQty = (o) => {{
        setIncreaseQtyItem(o);
        setIncreaseQtyReason("");
        setIncreaseQtyItems((o.line_items?.length > 0 ? o.line_items : [{{ id: null, item: o.item, quantity: o.total_quantity, uom: o.uom }}]).map(li => ({{
            line_item_id: li.id,
            item_name: li.item,
            current_qty: Number(li.quantity) || 0,
            add_qty: 0,
            uom: li.uom || "Nos"
        }})));
    }};

    const handleIncreaseQtySubmit = () => {{
        if (!increaseQtyReason.trim()) return toast.error("Please provide a reason/note.");
        const payloadItems = increaseQtyItems.filter(li => Number(li.add_qty) > 0).map(li => ({{
            line_item_id: li.line_item_id,
            additional_quantity: Number(li.add_qty),
            reason: increaseQtyReason.trim()
        }}));
        if (payloadItems.length === 0) return toast.error("Please enter additional quantity for at least one item.");
        
        increaseQtyMutation.mutate({{ id: increaseQtyItem.id, data: {{ items: payloadItems }} }});
    }};
"""
        content = content.replace("    return (", handler_str + "    return (", 1)
        
    # 3. Add Dialog
    if "Update Quantity</DialogTitle>" not in content:
        dialog_str = f"""
            <Dialog open={{!!increaseQtyItem}} onOpenChange={{(open) => !open && setIncreaseQtyItem(null)}}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader><DialogTitle>Update {title_short} Quantity (Admin Only)</DialogTitle></DialogHeader>
                    {{increaseQtyItem && (
                        <div className="py-4 space-y-4">
                            <div className="p-3 bg-primary/10 text-primary border border-primary/20 rounded-lg text-sm font-semibold">
                                {title_short} Number: {{increaseQtyItem.{var_name}_number}}
                            </div>
                            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                                {{increaseQtyItems.map((li, idx) => (
                                    <div key={{idx}} className="border rounded-md p-3 space-y-2">
                                        <div className="font-bold text-sm">{{li.item_name}}</div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <Label className="text-xs text-muted-foreground">Current Qty</Label>
                                                <Input value={{li.current_qty}} disabled className="h-8 opacity-100" />
                                            </div>
                                            <div>
                                                <Label className="text-xs text-primary font-bold">Add Qty</Label>
                                                <Input type="number" value={{li.add_qty || ""}} onChange={{e => {{
                                                    const newArr = [...increaseQtyItems];
                                                    newArr[idx].add_qty = Number(e.target.value);
                                                    setIncreaseQtyItems(newArr);
                                                }}}} className="h-8 border-primary/50 focus-visible:ring-primary" placeholder="0" />
                                            </div>
                                            <div>
                                                <Label className="text-xs text-muted-foreground">New Qty</Label>
                                                <Input value={{Number(li.current_qty) + Number(li.add_qty || 0)}} disabled className="h-8 opacity-100 font-bold" />
                                            </div>
                                        </div>
                                    </div>
                                ))}}
                            </div>
                            <div className="space-y-1.5">
                                <Label>Reason / Note <span className="text-destructive">*</span></Label>
                                <Input value={{increaseQtyReason}} onChange={{e => setIncreaseQtyReason(e.target.value)}} placeholder="Enter reason for quantity increase..." />
                            </div>
                        </div>
                    )}}
                    <DialogFooter>
                        <Button variant="outline" onClick={{() => setIncreaseQtyItem(null)}}>Cancel</Button>
                        <Button onClick={{handleIncreaseQtySubmit}} disabled={{increaseQtyMutation.isPending}}>
                            {{increaseQtyMutation.isPending ? "Saving..." : "Update Quantity"}}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
"""
        content = content.replace("        </div>\n    );\n};\n", dialog_str + "        </div>\n    );\n};\n")
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

patch_page('src/pages/PurchaseOrders.jsx', is_wo=False)
patch_page('src/pages/WorkOrders.jsx', is_wo=True)
print("Done patching frontend pages.")
