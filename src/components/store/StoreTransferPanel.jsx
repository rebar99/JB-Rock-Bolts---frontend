import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { transferStoreItem } from "@/lib/api";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);
const qty = value => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const input = "mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-background px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";
const Field = ({ label, children }) => <label className="block text-sm font-medium text-slate-700">{label}{children}</label>;

function TransferCard({ admin, onClick }) {
    return <section className="rounded-xl border bg-white p-5 shadow-card"><div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><ArrowLeftRight className="h-5 w-5" /></div><div><h2 className="font-bold">Transfer Stock</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">Move material from one store or location to another with a complete transfer audit trail.</p><div className="mt-4"><Button disabled={!admin} variant="outline" onClick={onClick}><ArrowLeftRight className="mr-2 h-4 w-4" />Transfer Stock</Button></div></div></div></section>;
}

export default function StoreTransferPanel({ inventory = [], admin = false }) {
    const client = useQueryClient(); const [cardsTarget, setCardsTarget] = useState(null); const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ itemId: "", quantity: "", from_location: "", to_location: "", transfer_date: today(), required_for: "", remarks: "" });
    useEffect(() => {
        const target = document.querySelector("main .grid.gap-5.lg\\:grid-cols-2");
        if (target) { target.classList.remove("lg:grid-cols-2"); target.classList.add("lg:grid-cols-3"); setCardsTarget(target); }
    }, []);
    const transfer = useMutation({ mutationFn: ({ id, body }) => transferStoreItem(id, body), onSuccess: () => { client.invalidateQueries({ queryKey: ["store-inventory"] }); setOpen(false); toast.success("Stock transfer recorded successfully."); }, onError: error => toast.error(error.message) });
    const selected = inventory.find(item => String(item.id) === String(form.itemId));
    const start = () => { setForm({ itemId: "", quantity: "", from_location: "", to_location: "", transfer_date: today(), required_for: "", remarks: "" }); setOpen(true); };
    const chooseMaterial = id => { const item = inventory.find(x => String(x.id) === id); setForm(current => ({ ...current, itemId: id, from_location: item?.location || "" })); };
    const submit = event => { event.preventDefault(); const requested = Number(form.quantity); if (!selected) return toast.error("Material select karein."); if (!requested || requested <= 0) return toast.error("Enter a valid transfer quantity."); if (requested > Number(selected.available_quantity)) return toast.error(`Insufficient stock. Only ${qty(selected.available_quantity)} units are available.`); if (!form.from_location.trim() || !form.to_location.trim()) return toast.error("Source aur destination store required hain."); transfer.mutate({ id: selected.id, body: { ...form, quantity: requested } }); };
    return <>{cardsTarget && createPortal(<TransferCard admin={admin} onClick={start} />, cardsTarget)}<Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Transfer Stock</DialogTitle><DialogDescription>Move material between stores/locations. Total company stock stays unchanged and the transfer is recorded in the ledger.</DialogDescription></DialogHeader><form noValidate onSubmit={submit} className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><Field label="Groups Name *"><select required value={form.itemId} onChange={e => chooseMaterial(e.target.value)} className={input}><option value="">Select material</option>{inventory.map(item => <option key={item.id} value={item.id}>{item.name} — Available: {qty(item.available_quantity)} {item.uom || "Nos"}</option>)}</select></Field><Field label="Transfer Date"><input type="date" value={form.transfer_date} onChange={e => setForm({ ...form, transfer_date: e.target.value })} className={input} /></Field><Field label="From Store / Location *"><input required value={form.from_location} onChange={e => setForm({ ...form, from_location: e.target.value })} className={input} placeholder="e.g. Main Store" /></Field><Field label="To Store / Location *"><input required value={form.to_location} onChange={e => setForm({ ...form, to_location: e.target.value })} className={input} placeholder="e.g. Project Store" /></Field><Field label="Transfer Quantity *"><input required type="number" min="0.01" step="0.01" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className={input} /></Field><Field label="Required For"><input value={form.required_for} onChange={e => setForm({ ...form, required_for: e.target.value })} className={input} placeholder="Project / purpose" /></Field></div>{selected && <div className="rounded-lg border border-violet-100 bg-violet-50 p-3 text-sm text-violet-900">Current available stock: <strong>{qty(selected.available_quantity)} {selected.uom || "Nos"}</strong> · Current location: <strong>{selected.location || "Not set"}</strong></div>}<Field label="Remarks"><textarea value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} className="mt-1.5 min-h-20 w-full rounded-md border p-3 text-sm" placeholder="Vehicle, challan no., handover details, etc." /></Field><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={transfer.isPending}>{transfer.isPending ? "Transferring…" : "Save Transfer"}</Button></DialogFooter></form></DialogContent></Dialog></>;
}
