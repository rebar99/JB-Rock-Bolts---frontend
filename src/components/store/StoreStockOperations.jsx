import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowUpFromLine, ClipboardList, History, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchAllStoreTransactions, issueStoreItem, transferStoreItem } from "@/lib/api";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);
const qty  = v => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const money = v => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDate = d => d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN") : "—";
const input = "mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-background px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";
const Field = ({ label, children }) => <label className="block text-sm font-medium text-slate-700">{label}{children}</label>;

function Card({ icon: Icon, title, text, button, color }) {
    return (
        <section className="rounded-xl border bg-white p-5 shadow-card">
            <div className="flex items-start gap-4">
                <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></div>
                <div className="min-w-0">
                    <h2 className="font-bold">{title}</h2>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">{text}</p>
                    <div className="mt-4">{button}</div>
                </div>
            </div>
        </section>
    );
}

export default function StoreStockOperations({ inventory = [], admin = false }) {
    const client = useQueryClient();
    const [tab, setTab] = useState("stock");          // "stock" | "history"
    const [search, setSearch] = useState("");
    const [txSearch, setTxSearch] = useState("");
    const [txType, setTxType] = useState("ALL");       // "ALL" | "ISSUE" | "TRANSFER"
    const [operation, setOperation] = useState(null);  // "out" | "transfer"
    const [stockOut, setStockOut] = useState({ item: null, quantity: "", required_for: "", issued_to: "", issue_date: today(), remarks: "" });
    const [transfer, setTransfer] = useState({ item: null, quantity: "", from_location: "", to_location: "", transfer_date: today(), required_for: "", remarks: "" });

    const { data: allTx = [], isLoading: txLoading } = useQuery({
        queryKey: ["store-all-transactions"],
        queryFn: fetchAllStoreTransactions,
        staleTime: 30000,
    });

    const refresh = () => {
        client.invalidateQueries({ queryKey: ["store-inventory"] });
        client.invalidateQueries({ queryKey: ["store-dashboard"] });
        client.invalidateQueries({ queryKey: ["store-all-transactions"] });
    };

    const issue = useMutation({
        mutationFn: ({ id, data }) => issueStoreItem(id, data),
        onSuccess: () => { refresh(); setOperation(null); toast.success("Material issued and inventory updated."); },
        onError: e => toast.error(e.message),
    });

    const move = useMutation({
        mutationFn: ({ id, data }) => transferStoreItem(id, data),
        onSuccess: () => { refresh(); setOperation(null); toast.success("Stock transfer recorded successfully."); },
        onError: e => toast.error(e.message),
    });

    const rows = useMemo(() =>
        inventory.filter(x => `${x.name} ${x.location || ""} ${x.vendor_name || ""}`.toLowerCase().includes(search.toLowerCase())),
        [inventory, search]);

    const filteredTx = useMemo(() => {
        const q = txSearch.toLowerCase();
        return allTx.filter(tx => {
            if (tx.type === "RECEIPT") return false;          // hide receipts
            const matchType = txType === "ALL" || tx.type === txType;
            const matchSearch = !q || `${tx.item_name} ${tx.issued_to || ""} ${tx.required_for || ""} ${tx.location || ""} ${tx.remarks || ""}`.toLowerCase().includes(q);
            return matchType && matchSearch;
        });
    }, [allTx, txSearch, txType]);

    return (
        <main className="min-h-[calc(100vh-4rem)] w-full bg-white px-4 py-7 sm:px-6 lg:px-8">
            <div className="w-full">
                <div className="text-center">
                    <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Stock Operations</h1>
                    <p className="mt-2 text-sm text-muted-foreground">Record every material issue and transfer through a controlled, traceable workflow.</p>
                </div>
                {!admin && <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">You have view-only access. Only a Store Admin can record stock operations.</div>}

                {/* Action Cards */}
                <div className="mt-6 grid gap-5 lg:grid-cols-2" id="store-ops-cards">
                    <Card icon={ArrowUpFromLine} title="Stock Out / Issue Material"
                        text="Issue material to a department, person or project. System blocks quantities above current available stock."
                        color="bg-amber-50 text-amber-700"
                        button={<Button disabled={!admin} variant="outline" onClick={() => setOperation("out")}><ArrowUpFromLine className="mr-2 h-4 w-4" />Issue Stock</Button>} />
                </div>

                {/* Tabs */}
                <div className="mt-6 flex gap-2 border-b">
                    <button onClick={() => setTab("stock")} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "stock" ? "border-cyan-600 text-cyan-700" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                        Stock Available
                    </button>
                    <button onClick={() => setTab("history")} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "history" ? "border-cyan-600 text-cyan-700" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                        <History className="h-3.5 w-3.5" />All Issue / Transfer History
                    </button>
                </div>

                {/* Tab: Stock Available */}
                {tab === "stock" && (
                    <section className="mt-4 rounded-xl border bg-white shadow-card">
                        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="font-bold">Stock available for operations</h2>
                                <p className="mt-1 text-xs text-muted-foreground">Use Issue to start a stock-out transaction for the selected material.</p>
                            </div>
                            <div className="relative w-full sm:w-80">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search material..." className="h-10 w-full rounded-lg border bg-slate-50 pl-9 pr-3 text-sm" />
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[900px] text-sm">
                                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                                    <tr>{["S.No.", "Groups Name", "Location", "Available Qty", "Rate", "Value", "Status", "Operation"].map(x => <th key={x} className="border-b px-4 py-3">{x}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {rows.length ? rows.map((item, i) => (
                                        <tr key={item.id} className="border-b hover:bg-slate-50">
                                            <td className="px-4 py-4 text-muted-foreground">{i + 1}</td>
                                            <td className="px-4 py-4 font-semibold">{item.name}<p className="mt-1 text-xs font-normal text-muted-foreground">{item.stock_item || "—"} · {item.uom || "Nos"}</p></td>
                                            <td className="px-4 py-4">{item.location || "—"}</td>
                                            <td className="px-4 py-4 font-bold text-emerald-700">{qty(item.available_quantity)}</td>
                                            <td className="px-4 py-4">{money(item.rate)}</td>
                                            <td className="px-4 py-4 font-medium">{money(item.remaining_stock_amount)}</td>
                                            <td className="px-4 py-4">
                                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === "In Stock" ? "bg-emerald-50 text-emerald-700" : item.status === "Low Stock" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{item.status}</span>
                                            </td>
                                            <td className="px-4 py-3 flex gap-2">
                                                <Button size="sm" disabled={!admin || Number(item.available_quantity) <= 0}
                                                    onClick={() => { setStockOut({ item, quantity: "", required_for: item.required_for || "", issued_to: "", issue_date: today(), remarks: "" }); setOperation("out"); }}>
                                                    <Send className="mr-1.5 h-3.5 w-3.5" />Issue
                                                </Button>
                                                <Button size="sm" variant="outline" disabled={!admin || Number(item.available_quantity) <= 0}
                                                    onClick={() => { setTransfer({ item, quantity: "", from_location: item.location || "", to_location: "", transfer_date: today(), required_for: "", remarks: "" }); setOperation("transfer"); }}>
                                                    <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />Transfer
                                                </Button>
                                            </td>
                                        </tr>
                                    )) : <tr><td colSpan="8" className="p-10 text-center text-muted-foreground"><ClipboardList className="mx-auto mb-3 h-8 w-8 text-slate-300" />No matching stock found.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {/* Tab: All Issue / Transfer History */}
                {tab === "history" && (
                    <section className="mt-4 rounded-xl border bg-white shadow-card">
                        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="font-bold">All Issue &amp; Transfer History</h2>
                                <p className="mt-1 text-xs text-muted-foreground">Complete audit trail of all material movements across all items.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <select value={txType} onChange={e => setTxType(e.target.value)} className="h-10 rounded-lg border bg-slate-50 px-3 text-sm">
                                    <option value="ALL">All Types</option>
                                    <option value="ISSUE">Issue Only</option>
                                    <option value="TRANSFER">Transfer Only</option>
                                </select>
                                <div className="relative w-full sm:w-72">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <input value={txSearch} onChange={e => setTxSearch(e.target.value)} placeholder="Search material, dept, person..." className="h-10 w-full rounded-lg border bg-slate-50 pl-9 pr-3 text-sm" />
                                </div>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            {txLoading ? (
                                <p className="p-8 text-center text-sm text-muted-foreground">Loading transactions…</p>
                            ) : (
                                <table className="w-full min-w-[1200px] table-fixed text-sm">
                                    <colgroup>
                                        <col style={{width:"55px"}} />
                                        <col style={{width:"100px"}} />
                                        <col style={{width:"100px"}} />
                                        <col style={{width:"180px"}} />
                                        <col style={{width:"70px"}} />
                                        <col style={{width:"100px"}} />
                                        <col style={{width:"110px"}} />
                                        <col style={{width:"140px"}} />
                                        <col style={{width:"130px"}} />
                                        <col style={{width:"110px"}} />
                                        <col style={{width:"130px"}} />
                                    </colgroup>
                                    <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                                        <tr>
                                            <th className="border-b px-4 py-3 text-left">S.No.</th>
                                            <th className="border-b px-4 py-3 text-left">Date</th>
                                            <th className="border-b px-4 py-3 text-left">Type</th>
                                            <th className="border-b px-4 py-3 text-left">Material Name</th>
                                            <th className="border-b px-4 py-3 text-right">Qty</th>
                                            <th className="border-b px-4 py-3 text-right">Rate</th>
                                            <th className="border-b px-4 py-3 text-right">Amount</th>
                                            <th className="border-b px-4 py-3 text-left">Issued To / Dept</th>
                                            <th className="border-b px-4 py-3 text-left">Required For</th>
                                            <th className="border-b px-4 py-3 text-left">Location</th>
                                            <th className="border-b px-4 py-3 text-left">Remarks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredTx.length ? filteredTx.map((tx, i) => (
                                            <tr key={tx.id} className="border-b hover:bg-slate-50">
                                                <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                                                <td className="px-4 py-3 whitespace-nowrap">{fmtDate(tx.date)}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${tx.type === "ISSUE" ? "bg-amber-50 text-amber-700" : tx.type === "TRANSFER" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>{tx.type}</span>
                                                </td>
                                                <td className="px-4 py-3 font-semibold">{tx.item_name}</td>
                                                <td className="px-4 py-3 text-right font-medium">{qty(tx.quantity)}</td>
                                                <td className="px-4 py-3 text-right">{money(tx.rate)}</td>
                                                <td className="px-4 py-3 text-right font-semibold">{money(tx.amount)}</td>
                                                <td className="px-4 py-3">{tx.issued_to || "—"}</td>
                                                <td className="px-4 py-3">{tx.required_for || "—"}</td>
                                                <td className="px-4 py-3">{tx.location || "—"}</td>
                                                <td className="px-4 py-3 text-muted-foreground">{tx.remarks || "—"}</td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="11" className="p-10 text-center text-muted-foreground">
                                                <History className="mx-auto mb-3 h-8 w-8 text-slate-300" />No transactions found.
                                            </td></tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </section>
                )}
            </div>

            {/* Issue Material Dialog */}
            <Dialog open={operation === "out"} onOpenChange={open => !open && setOperation(null)}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Issue Material</DialogTitle>
                        <DialogDescription>Issue quantity cannot exceed the current available stock.</DialogDescription>
                    </DialogHeader>
                    <form noValidate onSubmit={e => {
                        e.preventDefault();
                        const selected = stockOut.item;
                        const requested = Number(stockOut.quantity);
                        if (!selected) return toast.error("Material select karein.");
                        if (!requested || requested <= 0) return toast.error("Enter a valid issue quantity.");
                        if (requested > Number(selected.available_quantity)) return toast.error(`Insufficient stock. Only ${qty(selected.available_quantity)} units available.`);
                        issue.mutate({ id: selected.id, data: { ...stockOut, quantity: requested } });
                    }} className="space-y-5">
                        <Field label="Groups Name *">
                            <select required value={stockOut.item?.id || ""} onChange={e => { const item = inventory.find(i => String(i.id) === e.target.value); setStockOut({ ...stockOut, item, required_for: item?.required_for || "" }); }} className={input}>
                                <option value="">Select material</option>
                                {inventory.map(i => <option key={i.id} value={i.id}>{i.name} — Available: {qty(i.available_quantity)}</option>)}
                            </select>
                        </Field>
                        {stockOut.item && (
                            <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 text-sm sm:grid-cols-3">
                                <div><span className="text-xs text-muted-foreground">Available Quantity</span><p className="font-bold text-emerald-700">{qty(stockOut.item.available_quantity)} {stockOut.item.uom}</p></div>
                                <div><span className="text-xs text-muted-foreground">Rate</span><p>{money(stockOut.item.rate)}</p></div>
                                <div><span className="text-xs text-muted-foreground">Location</span><p>{stockOut.item.location || "—"}</p></div>
                            </div>
                        )}
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Issue Quantity *"><input required type="number" min="0.01" step="0.01" value={stockOut.quantity} onChange={e => setStockOut({ ...stockOut, quantity: e.target.value })} className={input} /></Field>
                            <Field label="Required For"><input value={stockOut.required_for} onChange={e => setStockOut({ ...stockOut, required_for: e.target.value })} className={input} /></Field>
                            <Field label="Issued To / Department / Person *">
                                <select required value={stockOut.issued_to} onChange={e => setStockOut({ ...stockOut, issued_to: e.target.value })} className={input}>
                                    <option value="">Select department / person</option>
                                    <option value="Production Department">Production Department</option>
                                    <option value="Engineering Workshop">Engineering Workshop</option>
                                    <option value="Electrical Engineering">Electrical Engineering</option>
                                    <option value="Administration">Administration</option>
                                    <option value="Construction / Building">Construction / Building</option>
                                </select>
                            </Field>
                            <Field label="Issue Date"><input type="date" value={stockOut.issue_date} onChange={e => setStockOut({ ...stockOut, issue_date: e.target.value })} className={input} /></Field>
                        </div>
                        <Field label="Remarks / Purpose"><textarea value={stockOut.remarks} onChange={e => setStockOut({ ...stockOut, remarks: e.target.value })} className="mt-1.5 min-h-20 w-full rounded-md border p-3 text-sm" /></Field>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOperation(null)}>Cancel</Button>
                            <Button type="submit" disabled={issue.isPending}>{issue.isPending ? "Issuing…" : "Save Issue"}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Transfer Stock Dialog */}
            <Dialog open={operation === "transfer"} onOpenChange={open => !open && setOperation(null)}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Transfer Stock</DialogTitle>
                        <DialogDescription>Move material from one location to another. A transfer record will be created.</DialogDescription>
                    </DialogHeader>
                    <form noValidate onSubmit={e => {
                        e.preventDefault();
                        const selected = transfer.item;
                        const requested = Number(transfer.quantity);
                        if (!selected) return toast.error("Material select karein.");
                        if (!requested || requested <= 0) return toast.error("Enter a valid transfer quantity.");
                        if (requested > Number(selected.available_quantity)) return toast.error(`Insufficient stock. Only ${qty(selected.available_quantity)} units available.`);
                        if (!transfer.to_location.trim()) return toast.error("Destination location required.");
                        move.mutate({ id: selected.id, data: { quantity: requested, from_location: transfer.from_location, to_location: transfer.to_location, transfer_date: transfer.transfer_date, required_for: transfer.required_for, remarks: transfer.remarks } });
                    }} className="space-y-5">
                        <Field label="Groups Name *">
                            <select required value={transfer.item?.id || ""} onChange={e => { const item = inventory.find(i => String(i.id) === e.target.value); setTransfer({ ...transfer, item, from_location: item?.location || "" }); }} className={input}>
                                <option value="">Select material</option>
                                {inventory.map(i => <option key={i.id} value={i.id}>{i.name} — Available: {qty(i.available_quantity)}</option>)}
                            </select>
                        </Field>
                        {transfer.item && (
                            <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 text-sm sm:grid-cols-3">
                                <div><span className="text-xs text-muted-foreground">Available Quantity</span><p className="font-bold text-emerald-700">{qty(transfer.item.available_quantity)} {transfer.item.uom}</p></div>
                                <div><span className="text-xs text-muted-foreground">Rate</span><p>{money(transfer.item.rate)}</p></div>
                                <div><span className="text-xs text-muted-foreground">Current Location</span><p>{transfer.item.location || "—"}</p></div>
                            </div>
                        )}
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Transfer Quantity *"><input required type="number" min="0.01" step="0.01" value={transfer.quantity} onChange={e => setTransfer({ ...transfer, quantity: e.target.value })} className={input} /></Field>
                            <Field label="Transfer Date"><input type="date" value={transfer.transfer_date} onChange={e => setTransfer({ ...transfer, transfer_date: e.target.value })} className={input} /></Field>
                            <Field label="From Location"><input value={transfer.from_location} onChange={e => setTransfer({ ...transfer, from_location: e.target.value })} className={input} placeholder="Current location" /></Field>
                            <Field label="To Location *"><input required value={transfer.to_location} onChange={e => setTransfer({ ...transfer, to_location: e.target.value })} className={input} placeholder="Destination location" /></Field>
                            <Field label="Required For"><input value={transfer.required_for} onChange={e => setTransfer({ ...transfer, required_for: e.target.value })} className={input} /></Field>
                        </div>
                        <Field label="Remarks"><textarea value={transfer.remarks} onChange={e => setTransfer({ ...transfer, remarks: e.target.value })} className="mt-1.5 min-h-20 w-full rounded-md border p-3 text-sm" /></Field>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOperation(null)}>Cancel</Button>
                            <Button type="submit" disabled={move.isPending}>{move.isPending ? "Transferring…" : "Save Transfer"}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </main>
    );
}
