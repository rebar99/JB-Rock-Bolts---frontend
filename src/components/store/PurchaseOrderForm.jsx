import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Printer, Settings, ShoppingCart, Trash2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemCombobox } from "@/components/ItemCombobox";
import { ItemMasterManageDialog } from "@/components/ItemMasterManageDialog";
import { UomManageDialog } from "@/components/UomManageDialog";
import { createStoreOrder, fetchItemMasterList, fetchUomOptions, updateStoreOrder, fetchStoreVendors } from "@/lib/api";
import { toast } from "sonner";
import jbEngineeringLogo from "@/assets/jb-engineering-logo.jpg";

const emptyLine = () => ({ item_description: "", quantity: 1, uom: "Nos", unit_rate: 0 });
const inputClass = "mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";
const Field = ({ label, children, className = "" }) => (
    <div className={`flex flex-col justify-end text-sm font-medium text-slate-700 ${className}`}>
        <label className="text-xs font-semibold text-slate-700 min-h-[1.25rem] flex items-end">
            {label}
        </label>
        {children}
    </div>
);

/** Compute default financial year tag (e.g. "26-27") from current date.
 *  Financial year: April to March.
 */
function defaultFYTag() {
    const now = new Date();
    const calYear = now.getFullYear();
    const fyStart = now.getMonth() >= 3 ? calYear : calYear - 1;
    return `${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}`;
}

/** Build PO number from series count + financial year tag */
function buildPONumber(orders, fyTag) {
    const series = String(orders.length + 1).padStart(2, "0");
    return `STR/0199/${series}-${fyTag}`;
}

export default function PurchaseOrderForm({ orders = [], admin = false, onBack, editingOrder = null, initialPoType = null }) {
    const queryClient = useQueryClient();
    const [manageItemsOpen, setManageItemsOpen] = useState(false);
    const [manageUomOpen, setManageUomOpen] = useState(false);
    // Store PO items have their own master. Marketing PO items are never
    // shown or changed from this Store Purchase workflow.
    const { data: itemMasterList = [] } = useQuery({ queryKey: ["item-master", "STORE"], queryFn: () => fetchItemMasterList("STORE") });
    const { data: uomOptions = [] } = useQuery({ queryKey: ["uom", "STORE"], queryFn: () => fetchUomOptions("STORE") });
    const { data: vendorList = [] } = useQuery({ queryKey: ["store-vendors"], queryFn: fetchStoreVendors });

    // Financial year is manually editable (default = current FY from date)
    const [financialYear, setFinancialYear] = useState(defaultFYTag);

    const [form, setForm] = useState(() => editingOrder ? ({
        ...editingOrder,
        po_type: editingOrder.po_type || "Approval Vendor PO",
        // Older records may still contain the retired Draft status.  Show
        // them as Pending Approval so the status selector never appears blank.
        status: editingOrder.status === "Draft" ? "Pending Approval" : editingOrder.status,
        po_date: editingOrder.po_date || new Date().toISOString().slice(0, 10),
        items: (editingOrder.items || []).map(item => ({ item_description: item.item_description, quantity: item.quantity, uom: item.uom, unit_rate: item.unit_rate })),
    }) : ({
        order_number: buildPONumber(orders, defaultFYTag()),
        po_type: initialPoType || "Approval Vendor PO",
        supplier: "", vendor_code: "", vendor_address: "", vendor_contact: "", vendor_gst: "",
        po_date: new Date().toISOString().slice(0, 10), reference: "Repeat Order",
        delivery_address: "RE-BAR Couplers India Private Limited\nVPO Palkwaha, Tehsil Haroli, District Una, Himachal Pradesh - 177220",
        gst_rate: 18, round_off: 0, price_basis: "FOR Tahliwal", packing_terms: "In your scope", freight_terms: "Extra", insurance_terms: "Included",
        delivery_terms: "", inspection_terms: "At our Store Department", warranty_terms: "Only genuine material", payment_terms: "", quantity_variance: "As per actual", notes: "",
        items: [emptyLine()], status: "Pending Approval",
    }));

    // Rebuild order_number whenever financial year changes (only for new POs)
    const handleFYChange = (newFY) => {
        setFinancialYear(newFY);
        if (!editingOrder) {
            setForm(curr => ({ ...curr, order_number: buildPONumber(orders, newFY) }));
        }
    };
    const totals = useMemo(() => {
        const subtotal = form.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_rate) || 0), 0);
        const gstAmount = subtotal * (Number(form.gst_rate) || 0) / 100;
        return { subtotal, gstAmount, grandTotal: subtotal + gstAmount + (Number(form.round_off) || 0) };
    }, [form.items, form.gst_rate, form.round_off]);
    const change = (key, value) => setForm(current => ({ ...current, [key]: value }));

    const applyVendorToPO = (vendor) => {
        if (!vendor) return;
        const contactParts = [vendor.person_name, vendor.contact].filter(Boolean);
        setForm(current => ({
            ...current,
            supplier: vendor.vendor_name,
            vendor_gst: vendor.vendor_gst || current.vendor_gst || "",
            vendor_contact: contactParts.length > 0 ? contactParts.join(" - ") : current.vendor_contact,
            vendor_address: vendor.address || current.vendor_address || "",
        }));
        toast.success(`Vendor "${vendor.vendor_name}" details auto-filled.`);
    };

    const handleSelectVendor = (vendorName) => {
        change("supplier", vendorName);
        const matched = vendorList.find(v => (v.vendor_name || "").trim().toLowerCase() === vendorName.trim().toLowerCase());
        if (matched) {
            applyVendorToPO(matched);
        }
    };

    const currentMatchedVendor = useMemo(() => {
        if (!form.supplier) return null;
        return vendorList.find(v => (v.vendor_name || "").trim().toLowerCase() === form.supplier.trim().toLowerCase()) || null;
    }, [vendorList, form.supplier]);

    const isLocalVendor = form.po_type === "One Time Vendor PO" || form.po_type === "One Time PO" || form.po_type === "One time PO" || form.po_type === "Local Vendor PO";
    const changeLine = (index, key, value) => setForm(current => ({ ...current, items: current.items.map((line, i) => i === index ? { ...line, [key]: value } : line) }));
    const save = useMutation({
        mutationFn: data => editingOrder ? updateStoreOrder(editingOrder.id, data) : createStoreOrder(data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["store-orders"] }); toast.success(editingOrder ? "Purchase Order updated successfully." : "Purchase Order saved successfully."); onBack?.(); },
        onError: error => toast.error(error.message),
    });
    const submit = event => {
        event.preventDefault();
        if (!admin) return toast.error("Only Store Admin can save a Purchase Order.");
        if (form.items.some(item => !item.item_description.trim() || Number(item.quantity) <= 0)) return toast.error("Enter an item description and quantity for every line.");
        save.mutate({ ...form, gst_rate: Number(form.gst_rate), round_off: Number(form.round_off), items: form.items.map(item => ({ ...item, quantity: Number(item.quantity), unit_rate: Number(item.unit_rate) })) });
    };
    const money = value => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatNumber = value => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
    return <main className="store-purchase-po mx-auto max-w-7xl p-5 sm:p-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4"><img src={jbEngineeringLogo} alt="JB Engineering" className="h-16 w-24 rounded-lg border object-contain" /><div><h1 className="text-2xl font-extrabold text-red-700 sm:text-3xl">RE-Bar Couplers India Private Limited</h1><p className="mt-1 font-semibold text-slate-800">VPO Palkwaha, Tehsil Haroli, District Una, Himachal Pradesh - 177220</p><p className="font-semibold text-slate-800">HO: 10 A&amp;B, Block 23, Industrial Area, Nangal Jarialan, Distt. Una - 177212</p><p className="mt-1 text-sm font-semibold text-slate-700">Cell: +91 9888603791 · seema@jbengineeringcorporation.com</p><p className="text-sm font-semibold text-slate-700">www.jbengineeringcorporation.com · GST No. 02AAFCR5621L1ZG</p></div></div>
                <div className="flex shrink-0 gap-2">{onBack && <Button type="button" variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />PO List</Button>}</div>
            </div>
            <div className="mt-5 border-t pt-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Vendor document</p><h2 className="mt-1 text-3xl font-bold text-slate-950">{editingOrder ? "Edit Purchase Order" : "Create Purchase Order"}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{editingOrder ? "Update vendor, material lines, rates, quantities, status and PO terms. Items/Stock records are independent from this Purchase Order." : "Enter the vendor details, item lines, GST, totals and terms to create the purchase order."}</p></div>
        </div>
        {!admin && <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">You have View Only access. You can view purchase orders, but only a Store Admin can save them.</div>}
        {!editingOrder && !initialPoType && <section className="mt-5 rounded-xl border bg-white p-5 shadow-sm sm:p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">PO Type</p><h2 className="mt-1 text-lg font-bold">Choose the purchase-order flow</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => change("po_type", "Approval Vendor PO")} className={`rounded-xl border-2 p-4 text-left transition ${!isLocalVendor ? "border-cyan-600 bg-cyan-50" : "border-slate-200 hover:border-cyan-200"}`}><p className="font-bold text-slate-950">Approval Vendor PO</p><p className="mt-1 text-xs text-slate-600">Full vendor details, GST, delivery address and standard terms.</p></button><button type="button" onClick={() => change("po_type", "One Time Vendor PO")} className={`rounded-xl border-2 p-4 text-left transition ${isLocalVendor ? "border-cyan-600 bg-cyan-50" : "border-slate-200 hover:border-cyan-200"}`}><p className="font-bold text-slate-950">One Time Vendor PO</p><p className="mt-1 text-xs text-slate-600">Quick, simple form for local purchases with only the essential fields.</p></button></div></section>}
        <div className="po-print-sheet hidden">
            <div className="po-print-company"><img src={jbEngineeringLogo} alt="JB Engineering" /><div><h1>RE-Bar Couplers India Private Limited</h1><p>VPO Palkwaha, Tehsil Haroli, District Una, Himachal Pradesh - 177220</p><p>HO: 10 A&amp;B, Block 23, Industrial Area, Nangal Jarialan, Distt. Una, Himachal Pradesh - 177212</p><p>Cell No. +91 9888603791 · seema@jbengineeringcorporation.com</p><p>www.jbengineeringcorporation.com · GST No. 02AAFCR5621L1ZG</p></div></div>
            <div className="po-print-title"><span>Vendor Code: {form.vendor_code || "—"}</span><strong>PURCHASE ORDER</strong></div>
            <div className="po-print-meta"><div><p><b>M/S:</b> {form.supplier || "—"}</p><p className="preline">{form.vendor_address || "Vendor address not provided"}</p><p><b>Kind Att:</b> {form.vendor_contact || "—"}</p><p><b>GST No.:</b> {form.vendor_gst || "—"}</p></div><div><p><b>PO No:</b> {form.order_number}</p><p><b>Dated:</b> {form.po_date ? new Date(`${form.po_date}T00:00:00`).toLocaleDateString("en-IN") : "—"}</p><p><b>Reference:</b> {form.reference || "—"}</p><p><b>Status:</b> {form.status}</p></div></div>
            <p className="po-print-intro">Please supply the following goods subject to the terms and conditions mentioned herein.</p>
            <table className="po-print-table"><thead><tr><th>Sr. No.</th><th>Item Description</th><th>Quantity</th><th>UoM</th><th>Unit Rate (INR)</th><th>Amount (INR)</th></tr></thead><tbody>{form.items.map((line, index) => <tr key={index}><td>{index + 1}</td><td>{line.item_description || "—"}</td><td>{formatNumber(line.quantity)}</td><td>{line.uom || "—"}</td><td>{money(Number(line.unit_rate) || 0)}</td><td>{money((Number(line.quantity) || 0) * (Number(line.unit_rate) || 0))}</td></tr>)}</tbody></table>
            <div className="po-print-totals"><p><span>Total</span><b>{money(totals.subtotal)}</b></p><p><span>IGST ({form.gst_rate}%)</span><b>{money(totals.gstAmount)}</b></p><p><span>Rounded off</span><b>{money(Number(form.round_off) || 0)}</b></p><p className="grand"><span>Total Amount Including Taxes</span><b>{money(totals.grandTotal)}</b></p></div>
            <section className="po-print-terms"><h3>Terms and Conditions</h3><p><b>Price:</b> {form.price_basis || "—"}</p><p><b>Packing &amp; Forwarding:</b> {form.packing_terms || "—"}</p><p><b>Freight &amp; Transportation:</b> {form.freight_terms || "—"}</p><p><b>Insurance:</b> {form.insurance_terms || "—"}</p><p><b>Delivery:</b> {form.delivery_terms || "—"}</p><p><b>Inspection:</b> {form.inspection_terms || "—"}</p><p><b>Guarantee / Warranty:</b> {form.warranty_terms || "—"}</p><p><b>Payment Terms:</b> {form.payment_terms || "—"}</p><p><b>Quantity Variance:</b> {form.quantity_variance || "—"}</p>{form.notes && <p><b>Notes:</b> {form.notes}</p>}</section>
            <div className="po-print-signatures"><span>Prepared By</span><span>Checked By</span><span>Approved By</span><span>For RE-Bar Couplers India Private Limited</span></div>
        </div>
        <style>{`.local-vendor-po > section:nth-of-type(2) > div:nth-of-type(2) > label:nth-child(4), .local-vendor-po > section:nth-of-type(2) > div:nth-of-type(2) > label:nth-child(5), .local-vendor-po > section:nth-of-type(2) > div:nth-of-type(2) > label:nth-child(6), .local-vendor-po > section:nth-of-type(2) > div:nth-of-type(2) > label:nth-child(7), .local-vendor-po > section:nth-of-type(2) > div:nth-of-type(3), .local-vendor-po > section:nth-of-type(4) { display: none; }`}</style>
        <form onSubmit={submit} className={`po-edit-form mt-6 space-y-6 ${isLocalVendor ? "local-vendor-po" : ""}`}>
            <section className="hidden print:block print:rounded-none print:border-0 print:pb-4"><div className="flex items-start justify-between border-b-2 border-slate-900 pb-3"><div><h1 className="text-xl font-bold">RE-Bar Couplers India Private Limited</h1><p className="text-xs">VPO Palkwaha, Tehsil Haroli, District Una, Himachal Pradesh - 177220</p></div><div className="text-right"><h2 className="text-lg font-bold">PURCHASE ORDER</h2><p className="text-xs">Vendor copy</p></div></div></section>
            <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-3 border-b pb-4">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-cyan-50 text-cyan-700">
                        <ShoppingCart className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="font-bold">Purchase Order header</h2>
                        <p className="text-xs text-muted-foreground">Select a registered vendor to auto-fill details, or type manually.</p>
                    </div>
                </div>

                <div className="mt-5 grid items-end gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Field label="Select Vendor">
                        <select
                            disabled={!admin}
                            value={currentMatchedVendor ? currentMatchedVendor.vendor_name : ""}
                            onChange={(e) => {
                                const found = vendorList.find(v => v.vendor_name === e.target.value);
                                if (found) applyVendorToPO(found);
                                else if (e.target.value === "") change("supplier", "");
                            }}
                            className={inputClass}
                        >
                            <option value="">-- Select Vendor to Auto-fill --</option>
                            {vendorList.filter(v => v.status !== "Inactive").map(v => (
                                <option key={v.id} value={v.vendor_name}>
                                    {v.vendor_name} {v.person_name ? `(${v.person_name})` : ""} {v.vendor_gst ? `• GST: ${v.vendor_gst}` : ""}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <Field label="Vendor Name *">
                        <div className="mt-1.5 flex gap-2">
                            <div className="grid h-10 w-20 shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-700">M/s.</div>
                            <input
                                required
                                disabled={!admin}
                                list="store-vendor-suggestions"
                                value={form.supplier}
                                onChange={e => handleSelectVendor(e.target.value)}
                                className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                                placeholder="Enter or select vendor name"
                            />
                            <datalist id="store-vendor-suggestions">
                                {vendorList.map(v => (
                                    <option key={v.id} value={v.vendor_name}>
                                        {v.person_name ? `${v.person_name} · ` : ""}{v.vendor_gst || ""}
                                    </option>
                                ))}
                            </datalist>
                        </div>
                    </Field>

                    <Field label="PO Number *">
                        <input required disabled={!admin} value={form.order_number} onChange={e => change("order_number", e.target.value)} className={inputClass} />
                    </Field>

                    {!editingOrder && (
                        <Field label="Financial Year">
                            <input disabled={!admin} value={financialYear} onChange={e => handleFYChange(e.target.value)} className={inputClass} placeholder="e.g. 26-27" maxLength={5} />
                        </Field>
                    )}

                    <Field label="PO Date *">
                        <input required disabled={!admin} type="date" value={form.po_date} onChange={e => change("po_date", e.target.value)} className={inputClass} />
                    </Field>

                    <Field label="Reference">
                        <select disabled={!admin} value={form.reference} onChange={e => change("reference", e.target.value)} className={inputClass}>
                            <option value="">Select</option>
                            <option value="Telephone">Telephone</option>
                            <option value="Email">Email</option>
                            <option value="Verbal Communication">Verbal Communication</option>
                            <option value="Repeat Order">Repeat Order</option>
                        </select>
                    </Field>

                    <Field label="Vendor Code">
                        <input disabled={!admin} value={form.vendor_code} onChange={e => change("vendor_code", e.target.value)} className={inputClass} />
                    </Field>

                    <Field label="Vendor GST No.">
                        <input disabled={!admin} value={form.vendor_gst} onChange={e => change("vendor_gst", e.target.value)} className={inputClass} placeholder="e.g. 02AAFCR..." />
                    </Field>

                    <Field label="Contact person / phone">
                        <input disabled={!admin} value={form.vendor_contact} onChange={e => change("vendor_contact", e.target.value)} className={inputClass} placeholder="Name - mobile number" />
                    </Field>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field label="Vendor Address">
                        <textarea disabled={!admin} value={form.vendor_address} onChange={e => change("vendor_address", e.target.value)} className={`${inputClass} h-24 py-2`} placeholder="Full vendor address" />
                    </Field>
                    <Field label="Delivery Address">
                        <textarea disabled={!admin} value={form.delivery_address} onChange={e => change("delivery_address", e.target.value)} className={`${inputClass} h-24 py-2`} />
                    </Field>
                </div>
            </section>
            <section className="overflow-hidden rounded-xl border bg-card shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="font-bold">Items</h2><p className="text-xs text-muted-foreground">Item Description, Quantity, UoM, Unit Rate and Amount</p></div>{admin && <div className="flex flex-wrap items-center gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setManageItemsOpen(true)}><Settings className="mr-1 h-3.5 w-3.5" />Manage Items</Button><Button type="button" size="sm" variant="outline" onClick={() => setManageUomOpen(true)}><Settings className="mr-1 h-3.5 w-3.5" />Manage UOM</Button><Button type="button" size="sm" onClick={() => setForm(current => ({ ...current, items: [...current.items, emptyLine()] }))}><Plus className="mr-2 h-4 w-4" />Add item line</Button></div>}</div><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-14 px-4 py-3 text-center">S.No.</th><th className="min-w-[300px] px-4 py-3">Item Description</th><th className="w-28 px-4 py-3">Quantity</th><th className="w-28 px-4 py-3">UoM</th><th className="w-36 px-4 py-3 text-right">Unit Rate (INR)</th><th className="w-36 px-4 py-3 text-right">Amount (INR)</th><th className="w-12 px-2 py-3" /></tr></thead><tbody>{form.items.map((line, index) => <tr key={index} className="border-t"><td className="px-4 py-3 text-center text-slate-500">{index + 1}</td><td className="px-4 py-2"><ItemCombobox value={line.item_description} onChange={value => changeLine(index, "item_description", value)} items={itemMasterList} disabled={!admin} placeholder="Select item from master" /></td><td className="px-4 py-2"><input required disabled={!admin} type="number" min="0.01" step="0.01" value={line.quantity} onChange={e => changeLine(index, "quantity", e.target.value)} className="h-9 w-full rounded border border-slate-200 px-2" /></td><td className="px-4 py-2"><select disabled={!admin} value={line.uom} onChange={e => changeLine(index, "uom", e.target.value)} className="h-9 w-full rounded border border-slate-200 bg-white px-2"><option value="">Select</option>{uomOptions.length ? uomOptions.map(option => <option key={option.id} value={option.name}>{option.name}</option>) : <option value="Nos">Nos</option>}</select></td><td className="px-4 py-2"><input disabled={!admin} type="number" min="0" step="0.01" value={line.unit_rate} onChange={e => changeLine(index, "unit_rate", e.target.value)} className="h-9 w-full rounded border border-slate-200 px-2 text-right" /></td><td className="px-4 py-3 text-right font-medium">{money((Number(line.quantity) || 0) * (Number(line.unit_rate) || 0))}</td><td className="px-2 py-2">{admin && form.items.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => setForm(current => ({ ...current, items: current.items.filter((_, i) => i !== index) }))} aria-label="Remove item"><Trash2 className="h-4 w-4 text-rose-600" /></Button>}</td></tr>)}</tbody></table></div><div className="ml-auto grid w-full max-w-md gap-2 border-t bg-slate-50 p-5 text-sm"><div className="flex justify-between"><span>Total</span><span className="font-medium">{money(totals.subtotal)}</span></div><div className="grid grid-cols-[1fr_100px_130px] items-center gap-3"><span>IGST</span><input disabled={!admin} type="number" min="0" max="100" step="0.01" value={form.gst_rate} onChange={e => change("gst_rate", e.target.value)} className="h-9 rounded border bg-white px-2 text-right" /><span className="text-right font-medium">{money(totals.gstAmount)}</span></div><div className="grid grid-cols-[1fr_130px] items-center gap-3"><span>Rounded off</span><input disabled={!admin} type="number" step="0.01" value={form.round_off} onChange={e => change("round_off", e.target.value)} className="h-9 rounded border bg-white px-2 text-right" /></div><div className="mt-1 flex justify-between border-t border-slate-300 pt-3 text-base font-bold text-slate-950"><span>Total Amount Incl. Taxes</span><span>{money(totals.grandTotal)}</span></div></div></section>
            <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6"><h2 className="font-bold">Terms and conditions</h2><p className="mt-1 text-xs text-muted-foreground">Update the standard terms from the Excel format as needed.</p><div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Field label="Price"><input disabled={!admin} value={form.price_basis} onChange={e => change("price_basis", e.target.value)} className={inputClass} /></Field><Field label="Packing & Forwarding"><input disabled={!admin} value={form.packing_terms} onChange={e => change("packing_terms", e.target.value)} className={inputClass} /></Field><Field label="Freight & Transportation"><input disabled={!admin} value={form.freight_terms} onChange={e => change("freight_terms", e.target.value)} className={inputClass} /></Field><Field label="Insurance"><input disabled={!admin} value={form.insurance_terms} onChange={e => change("insurance_terms", e.target.value)} className={inputClass} /></Field><Field label="Inspection"><input disabled={!admin} value={form.inspection_terms} onChange={e => change("inspection_terms", e.target.value)} className={inputClass} /></Field><Field label="Guarantee / Warranty"><input disabled={!admin} value={form.warranty_terms} onChange={e => change("warranty_terms", e.target.value)} className={inputClass} /></Field><Field label="Payment Terms"><input disabled={!admin} value={form.payment_terms} onChange={e => change("payment_terms", e.target.value)} className={inputClass} placeholder="e.g. 30 days after delivery" /></Field><Field label="Quantity Variance"><input disabled={!admin} value={form.quantity_variance} onChange={e => change("quantity_variance", e.target.value)} className={inputClass} /></Field><Field label="Delivery"><input disabled={!admin} value={form.delivery_terms} onChange={e => change("delivery_terms", e.target.value)} className={inputClass} placeholder="Delivery period and location" /></Field></div><Field label="Additional notes" className="mt-4"><textarea disabled={!admin} value={form.notes} onChange={e => change("notes", e.target.value)} className={`${inputClass} h-20 py-2`} /></Field><Field label="Remark 1" className="mt-4"><textarea disabled={!admin} value={form.remark_1} onChange={e => change("remark_1", e.target.value)} className={`${inputClass} h-12 py-2`} placeholder="e.g. Steel Material`s � 10% Quantity Will Be Allowed." /></Field><Field label="Remark 2 (Red)" className="mt-4"><textarea disabled={!admin} value={form.remark_2} onChange={e => change("remark_2", e.target.value)} className={`${inputClass} h-12 py-2 border-red-300 focus:border-red-500 focus:ring-red-200 text-red-700 placeholder-red-300`} placeholder="e.g. 1. MTC to be supplied along with the Consignment." /></Field></section>
            <div className="flex flex-wrap justify-end gap-3">{onBack && <Button type="button" variant="outline" onClick={onBack}>Cancel</Button>}{admin && <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving..." : editingOrder ? "Update Purchase Order" : "Save Purchase Order"}</Button>}</div>
        </form>
        <ItemMasterManageDialog open={manageItemsOpen} onOpenChange={setManageItemsOpen} type="STORE" />
        <UomManageDialog open={manageUomOpen} onOpenChange={setManageUomOpen} type="STORE" />
    </main>;
}




