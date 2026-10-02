import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, CircleDollarSign, Eye, History, Package, Pencil, Plus, Search, Send, Trash2, Warehouse, Building2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createStoreItem, deleteStoreItem, fetchStoreItemHistory, issueStoreItem, updateStoreItem, fetchStoreVendors, fetchItemMasterList } from "@/lib/api";
import ItemMasterManageDialog from "@/components/ItemMasterManageDialog";
import { toast } from "sonner";

const emptyItem = () => ({ name: "", stock_item: "", vendor_name: "", reference_no: "", receipt_date: new Date().toISOString().slice(0, 10), uom: "Nos", location: "", required_for: "", quantity: "", previous_quantity: "0", current_month_quantity: "0", reorder_level: "0", rate: "" });
const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const qty = value => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const inventoryColumnWidths = { "S.No.": 70, "Groups Name": 160, "Items Name": 145, Vendor: 140, "U/M": 90, "Previous Qty": 130, "Current Month Qty": 165, "Total Qty": 120, "Issue Qty": 120, "Available Qty": 140, Rate: 90, Amount: 120, Location: 120, Status: 110, Actions: 250 };
const input = "mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-background px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";

function StatCard({ label, value, icon: Icon, color }) { return <div className="rounded-xl border bg-white p-5 shadow-card"><div className="flex items-center gap-3"><div className={`grid h-11 w-11 place-items-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></div><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-0.5 text-2xl font-bold text-foreground">{value}</p></div></div></div>; }
function Field({ label, children, className = "" }) {
    return (
        <div className={`flex flex-col justify-end text-sm font-medium text-slate-700 ${className}`}>
            <label className="text-xs font-semibold text-slate-700 min-h-[1.25rem] flex items-end">
                {label}
            </label>
            {children}
        </div>
    );
}

function HistoryDialog({ item, onClose }) {
    const { data: history = [], isLoading } = useQuery({ queryKey: ["store-item-history", item?.id], queryFn: () => fetchStoreItemHistory(item.id), enabled: !!item });
    return <Dialog open={!!item} onOpenChange={open => !open && onClose()}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>{item?.name} — Stock history</DialogTitle><DialogDescription>All receipts and material issues are retained in this ledger.</DialogDescription></DialogHeader><div className="max-h-[60vh] overflow-auto rounded-lg border"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3">Required For</th><th className="px-4 py-3">Issued To / Vendor</th><th className="px-4 py-3">Location</th><th className="px-4 py-3 text-right">Rate</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody>{isLoading ? <tr><td colSpan="8" className="p-8 text-center text-muted-foreground">Loading history…</td></tr> : history.length ? history.map(row => <tr key={row.id} className="border-t"><td className="px-4 py-3">{row.date ? new Date(`${row.date}T00:00:00`).toLocaleDateString("en-IN") : "—"}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.type === "ISSUE" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{row.type}</span></td><td className="px-4 py-3 text-right font-medium">{qty(row.quantity)}</td><td className="px-4 py-3">{row.required_for || "—"}</td><td className="px-4 py-3">{row.issued_to || row.vendor_name || "—"}</td><td className="px-4 py-3">{row.location || "—"}</td><td className="px-4 py-3 text-right">{money(row.rate)}</td><td className="px-4 py-3 text-right font-medium">{money(row.amount)}</td></tr>) : <tr><td colSpan="8" className="p-8 text-center text-muted-foreground">No movements recorded yet.</td></tr>}</tbody></table></div><DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter></DialogContent></Dialog>;
}

function StockItemsDialog({ item, onClose }) {
    const rows = item?.stock_items?.length ? item.stock_items : item ? [{ id: "legacy", name: item.stock_item || "General", uom: item.uom, location: item.location, vendor_name: item.vendor_name, rate: item.rate, total_received_quantity: item.total_quantity, issued_quantity: item.issued_quantity, available_quantity: item.available_quantity, amount: item.remaining_stock_amount }] : [];
    return <Dialog open={!!item} onOpenChange={open => !open && onClose()}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>{item?.name} — Items Name</DialogTitle><DialogDescription>All items names under this material master. A material can have multiple items names.</DialogDescription></DialogHeader><div className="max-h-[60vh] overflow-auto rounded-lg border"><table className="w-full min-w-[820px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">S.No.</th><th className="px-4 py-3">Items Name</th><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">U/M</th><th className="px-4 py-3">Location</th><th className="px-4 py-3 text-right">Received</th><th className="px-4 py-3 text-right">Issued</th><th className="px-4 py-3 text-right">Available</th><th className="px-4 py-3 text-right">Rate</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody>{rows.map((stock, index) => <tr key={stock.id} className="border-t"><td className="px-4 py-3 text-center text-muted-foreground">{index + 1}</td><td className="px-4 py-3 font-semibold">{stock.name}</td><td className="px-4 py-3">{stock.vendor_name || "—"}</td><td className="px-4 py-3">{stock.uom || "Nos"}</td><td className="px-4 py-3">{stock.location || "—"}</td><td className="px-4 py-3 text-right">{qty(stock.total_received_quantity)}</td><td className="px-4 py-3 text-right">{qty(stock.issued_quantity)}</td><td className="px-4 py-3 text-right font-semibold text-emerald-700">{qty(stock.available_quantity)}</td><td className="px-4 py-3 text-right">{money(stock.rate)}</td><td className="px-4 py-3 text-right font-semibold">{money(stock.amount)}</td></tr>)}</tbody></table></div><DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter></DialogContent></Dialog>;
}

export default function StoreItems({ inventory = [], admin = false }) {
    const client = useQueryClient();
    const [search, setSearch] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [formMode, setFormMode] = useState("item");
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyItem());
    const [issuing, setIssuing] = useState(null);
    const [issue, setIssue] = useState({ quantity: "", required_for: "", issued_to: "", location: "", issue_date: new Date().toISOString().slice(0, 10), remarks: "" });
    const [viewing, setViewing] = useState(null);
    const [stockItemDetails, setStockItemDetails] = useState(null);
    const [manageItemsOpen, setManageItemsOpen] = useState(false);

    const { data: vendorList = [] } = useQuery({
        queryKey: ["store-vendors"],
        queryFn: fetchStoreVendors,
    });

    const { data: itemMasterList = [] } = useQuery({
        queryKey: ["item-master", "STORE"],
        queryFn: () => fetchItemMasterList("STORE"),
    });

    const groupOptions = useMemo(() => {
        const set = new Set();
        (itemMasterList || []).forEach(g => { if (g.name) set.add(g.name.trim()); });
        (inventory || []).forEach(i => { if (i.name) set.add(i.name.trim()); });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [itemMasterList, inventory]);

    const selectedMasterGroup = useMemo(() => {
        if (!form.name) return null;
        return (itemMasterList || []).find(g => (g.name || "").trim().toLowerCase() === form.name.trim().toLowerCase()) || null;
    }, [itemMasterList, form.name]);

    const availableItemsForGroup = useMemo(() => {
        const set = new Set();
        if (selectedMasterGroup && selectedMasterGroup.sizes) {
            selectedMasterGroup.sizes.forEach(s => { if (s.size) set.add(s.size.trim()); });
        }
        if (form.name) {
            const norm = form.name.trim().toLowerCase();
            (inventory || []).forEach(i => {
                if ((i.name || "").trim().toLowerCase() === norm) {
                    if (i.stock_item) set.add(i.stock_item.trim());
                    if (i.stock_items?.length) {
                        i.stock_items.forEach(st => { if (st.name) set.add(st.name.trim()); });
                    }
                }
            });
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [selectedMasterGroup, inventory, form.name]);

    const applyVendorToInventory = (vendor) => {
        if (!vendor) return;
        setForm(curr => ({
            ...curr,
            vendor_name: vendor.vendor_name,
        }));
        toast.success(`Vendor "${vendor.vendor_name}" selected.`);
    };

    const currentMatchedVendor = useMemo(() => {
        if (!form.vendor_name) return null;
        return vendorList.find(v => (v.vendor_name || "").trim().toLowerCase() === form.vendor_name.trim().toLowerCase()) || null;
    }, [vendorList, form.vendor_name]);
    const filtered = useMemo(() => inventory.filter(item => `${item.name} ${item.stock_item || ""} ${item.vendor_name || ""} ${item.location || ""}`.toLowerCase().includes(search.toLowerCase())), [inventory, search]);
    const totals = useMemo(() => ({ items: inventory.length, available: inventory.reduce((sum, x) => sum + Number(x.available_quantity || 0), 0), issued: inventory.reduce((sum, x) => sum + Number(x.issued_quantity || 0), 0), value: inventory.reduce((sum, x) => sum + Number(x.remaining_stock_amount || 0), 0) }), [inventory]);
    const refresh = () => {
        client.invalidateQueries({ queryKey: ["store-inventory"] });
        client.invalidateQueries({ queryKey: ["store-dashboard"] });
        client.invalidateQueries({ queryKey: ["item-master", "STORE"] });
    };
    const save = useMutation({ mutationFn: data => editing ? updateStoreItem(editing.id, data) : createStoreItem(data), onSuccess: () => { refresh(); setFormOpen(false); toast.success(editing ? "Material details updated." : formMode === "stock" ? "New stock received and available quantity updated." : "Material receipt saved and stock updated."); }, onError: error => toast.error(error.message) });
    const doIssue = useMutation({ mutationFn: data => issueStoreItem(issuing.id, data), onSuccess: () => { refresh(); client.invalidateQueries({ queryKey: ["store-item-history", issuing.id] }); setIssuing(null); toast.success("Material issued and available stock updated."); }, onError: error => toast.error(error.message) });
    const remove = useMutation({ mutationFn: deleteStoreItem, onSuccess: () => { refresh(); toast.success("Material deleted successfully."); }, onError: error => toast.error(error.message) });
    const openCreate = () => { setFormMode("item"); setEditing(null); setForm(emptyItem()); setFormOpen(true); };
    const openNewStock = () => { setFormMode("stock"); setEditing(null); setForm(emptyItem()); setFormOpen(true); };
    const openEdit = item => { setFormMode("edit"); setEditing(item); setForm({ ...emptyItem(), ...item, quantity: item.total_quantity ?? item.quantity ?? 0, rate: item.rate ?? 0, receipt_date: item.receipt_date || "" }); setFormOpen(true); };
    const submit = event => { event.preventDefault(); if (!admin) return; const data = { ...form, name: form.name.trim(), quantity: Number(form.quantity || 0), previous_quantity: Number(form.previous_quantity || 0), current_month_quantity: Number(form.current_month_quantity || 0), reorder_level: Number(form.reorder_level || 0), rate: Number(form.rate || 0) }; if (!editing && data.quantity <= 0) return toast.error("Total Quantity must be greater than zero."); if (formMode === "stock" && !inventory.some(item => item.name.toLowerCase() === data.name.toLowerCase())) return toast.error("New Stock ke liye existing material select karein. Naya material Add Inventory se banayein."); save.mutate(data); };
    const selectExisting = value => {
        const found = inventory.find(x => x.name.toLowerCase() === value.toLowerCase());
        if (found) setForm(current => ({ ...current, name: found.name, stock_item: found.stock_item || "", uom: found.uom || "Nos", location: found.location || "", vendor_name: found.vendor_name || current.vendor_name || "", rate: found.rate || 0 }));
        else setForm(current => ({ ...current, name: value }));
    };
    const handleSelectGroup = value => {
        selectExisting(value);
    };
    return <main className="min-h-[calc(100vh-4rem)] w-full bg-white px-4 py-7 sm:px-6 lg:px-8"><div className="w-full"><div className="relative text-center"><h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Inventory & Material Stock</h1><p className="mt-2 text-sm text-muted-foreground">Maintain material receipts, available stock, rate history and issues in one place.</p><div className="mt-6 flex flex-wrap justify-end gap-2">{admin && <><Button variant="outline" onClick={openNewStock}><Warehouse className="mr-2 h-4 w-4" />New Stock</Button><Button onClick={openCreate} className="bg-gradient-primary shadow-elegant hover:opacity-90"><Plus className="mr-2 h-4 w-4" />Add Inventory</Button></>}</div></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Material Masters" value={qty(totals.items)} icon={Boxes} color="bg-primary/10 text-primary" /><StatCard label="Available Stock" value={qty(totals.available)} icon={Warehouse} color="bg-cyan-50 text-cyan-700" /><StatCard label="Issued Quantity" value={qty(totals.issued)} icon={Send} color="bg-amber-50 text-amber-700" /><StatCard label="Remaining Stock Value" value={money(totals.value)} icon={CircleDollarSign} color="bg-emerald-50 text-emerald-700" /></div>
        <section className="mt-5 rounded-xl border bg-white p-4 shadow-card"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search material, items name, vendor or location..." className="h-10 w-full rounded-lg border bg-slate-50 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" /></div></section>
        <section className="mt-5 overflow-hidden rounded-xl border bg-white shadow-card"><div className="overflow-x-auto"><table key="inventory-native-table-v3" data-store-native-sno="true" className="w-full min-w-[2200px] table-fixed text-sm"><thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500"><tr>{["S.No.", "Groups Name", "Items Name", "Vendor", "U/M", "Previous Qty", "Current Month Qty", "Total Qty", "Issue Qty", "Available Qty", "Rate", "Amount", "Location", "Status", "Actions"].map(h => <th key={h} style={{ width: `${inventoryColumnWidths[h]}px`, minWidth: `${inventoryColumnWidths[h]}px` }} className={`border-b px-3 py-3 ${h === "S.No." || ["Previous Qty", "Current Month Qty", "Total Qty", "Issue Qty", "Available Qty", "Rate", "Amount", "Location", "Status", "Actions"].includes(h) ? "whitespace-nowrap text-center" : ""}`}>{h}</th>)}</tr></thead><tbody>{filtered.length ? filtered.map((item, index) => <tr key={item.id} className="border-b transition-colors hover:bg-slate-50"><td className="px-3 py-4 text-center text-muted-foreground">{index + 1}</td><td className="px-3 py-4 font-semibold"><button type="button" onClick={() => setStockItemDetails(item)} className="text-left text-primary hover:underline" title="View all items names">{item.name}</button><p className="mt-1 text-xs font-normal text-muted-foreground">{item.stock_items?.length || 1} items name{(item.stock_items?.length || 1) === 1 ? "" : "s"} · Required: {item.required_for || "—"}</p></td><td className="px-3 py-4">{item.stock_item || "—"}</td><td className="px-3 py-4">{item.vendor_name || "—"}<p className="mt-1 text-xs text-muted-foreground">{item.reference_no || ""}</p></td><td className="px-3 py-4">{item.uom || "Nos"}</td><td className="px-3 py-4 text-center">{qty(item.previous_quantity)}</td><td className="px-3 py-4 text-center">{qty(item.current_month_quantity)}</td><td className="px-3 py-4 text-center">{qty(item.total_quantity)}</td><td className="px-3 py-4 text-center text-amber-700 font-medium">{qty(item.issued_quantity)}</td><td className="px-3 py-4 text-center font-semibold text-emerald-700">{qty(item.available_quantity)}</td><td className="px-3 py-4 text-center">{money(item.rate)}</td><td className="px-3 py-4 text-center font-medium">{money(item.remaining_stock_amount)}</td><td className="px-3 py-4 text-center">{item.location || "—"}</td><td className="px-3 py-4 text-center"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === "In Stock" ? "bg-emerald-50 text-emerald-700" : item.status === "Low Stock" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{item.status}</span></td><td className="px-3 py-3 text-center"><div className="flex items-center justify-center gap-1"><Button variant="ghost" size="icon" title="View history" onClick={() => setViewing(item)}><Eye className="h-4 w-4" /></Button>{admin && <><Button variant="ghost" size="icon" title="Edit material" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Delete material" className="text-destructive hover:text-destructive" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete ${item.name}? This permanently removes its stock and transaction history.`)) remove.mutate(item.id); }}><Trash2 className="h-4 w-4" /></Button><Button size="sm" disabled={Number(item.available_quantity) <= 0} onClick={() => { setIssuing(item); setIssue({ quantity: "", required_for: item.required_for || "", issued_to: "", location: "", issue_date: new Date().toISOString().slice(0, 10), remarks: "" }); }}><Send className="mr-1.5 h-3.5 w-3.5" />Issue Material</Button></>}</div></td></tr>) : <tr><td colSpan="15" className="p-12 text-center text-muted-foreground"><Package className="mx-auto mb-3 h-8 w-8 text-slate-300" />No materials found. Add the first material receipt to begin stock management.</td></tr>}</tbody></table></div></section></div>
        <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>{editing ? "Edit Material Details" : formMode === "stock" ? "Receive New Stock" : "Add Inventory / Receive Material"}</DialogTitle><DialogDescription>{editing ? "Update the material master fields. Stock balance is protected by the transaction ledger." : formMode === "stock" ? "Select an existing material to add a new stock receipt. Its available quantity and rate history will update automatically." : "A matching material name updates its stock instead of creating a duplicate master."}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-5">                    <section className="rounded-xl border bg-card p-5">
                        <div className="flex items-center gap-2.5">
                            <Building2 className="h-5 w-5 text-cyan-700" />
                            <div>
                                <h2 className="font-bold">Vendor Details</h2>
                                <p className="text-xs text-muted-foreground">Select a registered vendor to auto-fill details, or enter manually.</p>
                            </div>
                        </div>

                        <div className="mt-4 grid items-end gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <Field label="Select Vendor">
                                <select
                                    value={currentMatchedVendor ? currentMatchedVendor.vendor_name : ""}
                                    onChange={(e) => {
                                        const chosen = vendorList.find(v => v.vendor_name === e.target.value);
                                        if (chosen) applyVendorToInventory(chosen);
                                        else if (e.target.value === "") setForm(curr => ({ ...curr, vendor_name: "" }));
                                    }}
                                    className={input}
                                >
                                    <option value="">-- Select Vendor to Auto-fill --</option>
                                    {vendorList.filter(v => v.status !== "Inactive").map(v => (
                                        <option key={v.id} value={v.vendor_name}>
                                            {v.vendor_name} {v.person_name ? `(${v.person_name})` : ""} {v.vendor_gst ? `• GST: ${v.vendor_gst}` : ""}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="Vendor Name">
                                <input
                                    value={form.vendor_name || ""}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setForm(curr => ({ ...curr, vendor_name: val }));
                                        const matched = vendorList.find(v => (v.vendor_name || "").trim().toLowerCase() === val.trim().toLowerCase());
                                        if (matched) applyVendorToInventory(matched);
                                    }}
                                    className={input}
                                    placeholder="Select or enter vendor"
                                    list="store-vendors"
                                />
                                <datalist id="store-vendors">
                                    {vendorList.map(x => <option key={x.id} value={x.vendor_name} />)}
                                </datalist>
                            </Field>

                            <Field label="PO / Reference No.">
                                <input
                                    value={form.reference_no || ""}
                                    onChange={e => setForm({ ...form, reference_no: e.target.value })}
                                    className={input}
                                    placeholder="e.g. PO-0199 or Bill No"
                                />
                            </Field>

                            <Field label="Receipt Date">
                                <input
                                    type="date"
                                    value={form.receipt_date || ""}
                                    onChange={e => setForm({ ...form, receipt_date: e.target.value })}
                                    className={input}
                                />
                            </Field>
                        </div>

                        {currentMatchedVendor && (
                            <div className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50/70 p-3 text-xs text-cyan-950 space-y-1.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-bold flex items-center gap-1.5 text-cyan-900">
                                        <Building2 className="h-4 w-4 text-cyan-700" />
                                        Auto-filled from Vendor Master: {currentMatchedVendor.vendor_name}
                                    </span>
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                        Status: {currentMatchedVendor.status || "Active"}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-700 text-[11px]">
                                    {currentMatchedVendor.person_name && <span><strong>Contact Person:</strong> {currentMatchedVendor.person_name}</span>}
                                    {currentMatchedVendor.contact && <span><strong>Phone:</strong> {currentMatchedVendor.contact}</span>}
                                    {currentMatchedVendor.vendor_gst && <span><strong>GST No:</strong> {currentMatchedVendor.vendor_gst}</span>}
                                    {currentMatchedVendor.address && <span className="truncate max-w-sm"><strong>Address:</strong> {currentMatchedVendor.address}</span>}
                                </div>
                                {currentMatchedVendor.items_supplied?.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-cyan-200/80">
                                        <span className="text-[11px] font-bold text-cyan-900">Materials Supplied by Vendor (Click to fill):</span>
                                        {(Array.isArray(currentMatchedVendor.items_supplied) ? currentMatchedVendor.items_supplied : []).map((mat, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => {
                                                    setForm(curr => ({
                                                        ...curr,
                                                        name: curr.name || mat,
                                                        stock_item: curr.name ? mat : (curr.stock_item || mat)
                                                    }));
                                                    toast.success(`Selected material "${mat}".`);
                                                }}
                                                className="rounded-md border border-cyan-300 bg-white px-2 py-0.5 text-[11px] font-medium text-cyan-800 hover:bg-cyan-100 transition-colors"
                                                title="Click to fill Groups Name / Items Name"
                                            >
                                                + {mat}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                    <section className="rounded-xl border bg-card p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h2 className="font-bold">Material Details</h2>
                                <p className="mt-1 text-xs text-muted-foreground">Select Group Name and its corresponding Item Name.</p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setManageItemsOpen(true)}
                                className="text-xs h-8 border-cyan-300 text-cyan-700 hover:bg-cyan-50"
                            >
                                <Settings className="mr-1.5 h-3.5 w-3.5" />
                                Manage Items (Add Group & Item)
                            </Button>
                        </div>
                        <div className="mt-4 grid items-end gap-4 md:grid-cols-2 lg:grid-cols-3">
                            <Field label="Groups Name *">
                                <select
                                    required
                                    value={form.name}
                                    onChange={e => handleSelectGroup(e.target.value)}
                                    className={input}
                                >
                                    <option value="">-- Select Group Name --</option>
                                    {groupOptions.map(g => (
                                        <option key={g} value={g}>{g}</option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="Items Name">
                                <select
                                    value={form.stock_item || ""}
                                    onChange={e => setForm(curr => ({ ...curr, stock_item: e.target.value }))}
                                    className={input}
                                    disabled={!form.name}
                                >
                                    <option value="">
                                        {!form.name ? "-- First Select Group Name --" : availableItemsForGroup.length ? "-- Select Item Name --" : "-- No items in this group --"}
                                    </option>
                                    {availableItemsForGroup.map(item => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="U/M">
                                <input value={form.uom || "Nos"} onChange={e => setForm({ ...form, uom: e.target.value })} className={input} />
                            </Field>
                            <Field label="Location">
                                <input value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })} className={input} />
                            </Field>
                            <Field label="Required For">
                                <input value={form.required_for || ""} onChange={e => setForm({ ...form, required_for: e.target.value })} className={input} />
                            </Field>
                            <Field label="Reorder Level">
                                <input type="number" min="0" step="0.01" value={form.reorder_level} onChange={e => setForm({ ...form, reorder_level: e.target.value })} className={input} />
                            </Field>
                        </div>
                    </section><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b p-5"><h2 className="font-bold">Quantity Planning</h2><p className="mt-1 text-xs text-muted-foreground">Amount is calculated automatically from Total Quantity × Rate.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr>{["Total Quantity", "Previous Month Qty", "Current Month Qty", "Rate", "Amount"].map(x => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody><tr><td className="p-3"><input required type="number" min="0.01" step="0.01" value={form.quantity} disabled={!!editing} onChange={e => setForm({ ...form, quantity: e.target.value })} className="h-9 w-full rounded border px-2 disabled:cursor-not-allowed disabled:bg-slate-100" /></td><td className="p-3"><input type="number" min="0" step="0.01" value={form.previous_quantity} disabled={!!editing} onChange={e => setForm({ ...form, previous_quantity: e.target.value })} className="h-9 w-full rounded border px-2 disabled:cursor-not-allowed disabled:bg-slate-100" /></td><td className="p-3"><input required type="number" min="0" step="0.01" value={form.current_month_quantity} onChange={e => setForm({ ...form, current_month_quantity: e.target.value })} className="h-9 w-full rounded border px-2" /></td><td className="p-3"><input required type="number" min="0" step="0.01" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} className="h-9 w-full rounded border px-2" /></td><td className="p-3 text-right font-bold">{money(Number(form.quantity || 0) * Number(form.rate || 0))}</td></tr></tbody></table></div></section><DialogFooter><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>{admin && <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : editing ? "Save Changes" : formMode === "stock" ? "Receive New Stock" : "Save Material"}</Button>}</DialogFooter></form></DialogContent></Dialog>
        <Dialog open={!!issuing} onOpenChange={open => !open && setIssuing(null)}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Issue Material</DialogTitle><DialogDescription>Material information is auto-filled. Only enter the issue transaction details.</DialogDescription></DialogHeader>{issuing && <form noValidate onSubmit={e => { e.preventDefault(); const requested = Number(issue.quantity); if (!requested || requested <= 0) return toast.error("Enter a valid issue quantity."); if (requested > Number(issuing.available_quantity)) return toast.error(`Insufficient stock. Only ${qty(issuing.available_quantity)} units are available.`); if (!issue.issued_to?.trim() && !issue.location?.trim()) return toast.error("Select department/person or enter location."); doIssue.mutate({ ...issue, quantity: requested }); }} className="space-y-5"><div className="grid gap-3 rounded-xl border bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3"><div><span className="text-xs text-muted-foreground">Groups Name</span><p className="font-semibold">{issuing.name}</p></div><div><span className="text-xs text-muted-foreground">Items Name / U/M</span><p>{issuing.stock_item || "—"} · {issuing.uom}</p></div><div><span className="text-xs text-muted-foreground">Available Quantity</span><p className="font-bold text-cyan-700">{qty(issuing.available_quantity)}</p></div><div><span className="text-xs text-muted-foreground">Rate / Amount</span><p>{money(issuing.rate)} / {money(Number(issuing.available_quantity) * Number(issuing.rate))}</p></div><div><span className="text-xs text-muted-foreground">Location</span><p>{issuing.location || "—"}</p></div></div><div className="grid gap-4 md:grid-cols-2"><Field label="Issue Quantity *"><input required autoFocus type="number" min="0.01" step="0.01" value={issue.quantity} onChange={e => setIssue({ ...issue, quantity: e.target.value })} className={input} /></Field><Field label="Required For"><input value={issue.required_for} onChange={e => setIssue({ ...issue, required_for: e.target.value })} className={input} /></Field><Field label="Issued To / Department / Person"><select value={issue.issued_to} onChange={e => setIssue({ ...issue, issued_to: e.target.value })} className={input}><option value="">Select department / person</option><option value="Production Department">Production Department</option><option value="Engineering Workshop">Engineering Workshop</option><option value="Electrical Engineering">Electrical Engineering</option><option value="Administration">Administration</option><option value="Construction / Building">Construction / Building</option></select></Field><Field label="Location"><input type="text" list="storeitems-dest-locations" placeholder="Enter destination location" value={issue.location || ""} onChange={e => setIssue({ ...issue, location: e.target.value })} className={input} /><datalist id="storeitems-dest-locations">{[...new Set(inventory.map(i => i.location).filter(Boolean))].map(loc => <option key={loc} value={loc} />)}</datalist></Field><Field label="Issue Date"><input type="date" value={issue.issue_date} onChange={e => setIssue({ ...issue, issue_date: e.target.value })} className={input} /></Field></div><Field label="Remarks / Purpose"><textarea value={issue.remarks} onChange={e => setIssue({ ...issue, remarks: e.target.value })} className="mt-1.5 min-h-20 w-full rounded-md border p-3 text-sm" /></Field><DialogFooter><Button type="button" variant="outline" onClick={() => setIssuing(null)}>Cancel</Button><Button type="submit" disabled={doIssue.isPending}>{doIssue.isPending ? "Issuing…" : "Save Issue"}</Button></DialogFooter></form>}</DialogContent></Dialog><HistoryDialog item={viewing} onClose={() => setViewing(null)} /><StockItemsDialog item={stockItemDetails} onClose={() => setStockItemDetails(null)} /><ItemMasterManageDialog open={manageItemsOpen} onOpenChange={setManageItemsOpen} type="STORE" /></main>;
}
