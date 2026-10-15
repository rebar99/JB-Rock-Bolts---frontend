import jbEngineeringLogo from "@/assets/jb-engineering-logo.jpg";

export const formatNumber = value => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const formatDate = value => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const escapeHtml = value => String(value ?? "—").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

export function getItemOnlyName(description, itemMasters = []) {
    if (!description) return "—";
    const raw = String(description).trim();
    if (!raw) return "—";

    const candidateList = [
        ...(Array.isArray(itemMasters) ? itemMasters : []),
        ...(Array.isArray(typeof window !== "undefined" && window.__STORE_ITEM_MASTERS__ ) ? window.__STORE_ITEM_MASTERS__ : []),
    ];

    const masterNames = [...new Set(
        candidateList
            .map(m => (typeof m === "string" ? m : m?.name || "").trim())
            .filter(Boolean)
    )].sort((a, b) => b.length - a.length);

    for (const group of masterNames) {
        if (raw.toLowerCase() === group.toLowerCase()) {
            return raw;
        }
        if (raw.toLowerCase().startsWith(group.toLowerCase())) {
            const remainder = raw.slice(group.length).trim().replace(/^[-:,/]\s*/, "");
            if (remainder) return remainder;
        }
    }
    return raw;
}

export function printPurchaseOrder(order, itemMasterList = []) {
    if (!order) return;
    const items = (order.items || []).map((item, index) => {
        const displayName = item.item_name || getItemOnlyName(item.item_description, itemMasterList);
        return `<tr><td>${index + 1}</td><td>${escapeHtml(displayName)}</td><td>${formatNumber(item.quantity)}</td><td>${escapeHtml(item.uom)}</td><td>&#8377;${formatNumber(item.unit_rate)}</td><td>&#8377;${formatNumber(item.amount)}</td></tr>`;
    }).join("");

    const html = `<!doctype html><html><head><title>PO ${escapeHtml(order.order_number)}</title><style>@page{size:A4 portrait;margin:12mm 12mm 12mm 15mm}*{box-sizing:border-box}html,body{width:100%;min-height:100%;background:#fff}body{margin:0;padding:0 2px;font-family:Arial,Helvetica,sans-serif;color:#0c2348;font-size:11px;line-height:1.35}.sheet{width:100%;min-height:273mm}.company{display:flex;align-items:center;gap:14px;padding:4px 0 9px;border-bottom:2px solid #12386c}.logo{width:70px;height:54px;border:1px solid #d2dbe8;object-fit:contain;border-radius:2px}.company h1{margin:0;color:#e5222b;font-size:20px;line-height:1.1}.company p{margin:2px 0;font-size:10px;font-weight:600}.title{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #365780;padding:8px 0}.title strong{font-size:18px;letter-spacing:.2px}.meta{display:grid;grid-template-columns:1.65fr 1fr;gap:12px;border-bottom:1px solid #9aacca;padding:10px 0;line-height:1.55}.meta p{margin:0}.intro{margin:8px 0;font-size:10px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #6480a4;padding:6px;vertical-align:middle;text-align:center}th{background:#e8eff8;font-size:9px}.right{text-align:right}.totals{width:43%;margin-left:auto;border-top:none;border-right:1px solid #6480a4;border-bottom:1px solid #6480a4;border-left:1px solid #6480a4}.totals div{display:flex;justify-content:space-between;padding:6px;border-top:1px solid #b5c3d5}.totals .grand{background:#d8e9ff;font-weight:bold}.terms-container{margin-top:12px;border:1px solid #6480a4;width:100%}.terms-body{padding:7px 9px;line-height:1.55}.terms-body h3{margin:0 0 4px;font-size:11px}.terms-body p{margin:1px 0}.remark-red{color:#e5222b !important;font-weight:bold !important}.sign-block{border-top:1px solid #6480a4;padding:8px 12px 10px;font-size:10px}.sign-block .company-for{text-align:right;font-weight:bold;font-size:11px}.sign-block .sign-row{display:flex;justify-content:space-between;align-items:flex-end;margin-top:48px;font-weight:bold;font-size:10px;padding:0 5px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.remark-red, .remark-red font{color:#e5222b !important;font-weight:bold !important}.totals{border-left:1px solid #6480a4 !important}.terms-container{border-left:1px solid #6480a4 !important}}</style></head><body><main class="sheet"><section class="company"><img class="logo" src="${jbEngineeringLogo}" alt="JB Engineering"/><div><h1>RE-Bar Couplers India Private Limited</h1><p>VPO Palkwaha, Tehsil Haroli, District Una, Himachal Pradesh - 177220</p><p>HO: 10 A&amp;B, Block 23, Industrial Area, Nangal Jarialan, Distt. Una, Himachal Pradesh - 177212</p><p>Cell No. +91 9888603791 &middot; seema@jbengineeringcorporation.com</p><p>www.jbengineeringcorporation.com &middot; GST No. 02AAFCR5621L1ZG</p></div></section><section class="title"><span>Vendor Code: ${escapeHtml(order.vendor_code)}</span><strong>PURCHASE ORDER</strong></section><section class="meta"><div><p><b>Vendor Name:</b> ${escapeHtml(order.supplier)}</p><p><b>Vendor Address:</b> ${escapeHtml(order.vendor_address || "Vendor address not provided").replace(/\n/g, "<br/>")}</p><p><b>Contact Person / Phone:</b> ${escapeHtml(order.vendor_contact)}</p><p><b>Vendor GST No.:</b> ${escapeHtml(order.vendor_gst)}</p></div><div><p><b>PO No:</b> ${escapeHtml(order.order_number)}</p><p><b>PO Date:</b> ${formatDate(order.po_date || order.created_at)}</p><p><b>Reference:</b> ${escapeHtml(order.reference)}</p><p><b>Status:</b> ${escapeHtml(order.status)}</p>${order.delivery_address ? `<p><b>Delivery Address:</b> ${escapeHtml(order.delivery_address).replace(/\n/g, "<br/>")}</p>` : ""}</div></section><p class="intro">Please supply the following goods subject to the terms and conditions mentioned herein.</p><table><thead><tr><th>Sr. No.</th><th>Item Description</th><th>Quantity</th><th>U/M</th><th>Unit Rate (INR)</th><th>Amount (INR)</th></tr></thead><tbody>${items}</tbody></table><section class="totals" style="border-left:1px solid #6480a4"><div><span>Total</span><b>&#8377;${formatNumber(order.subtotal)}</b></div><div><span>IGST (${order.gst_rate || 0}%)</span><b>&#8377;${formatNumber(order.gst_amount)}</b></div><div><span>Rounded off</span><b>&#8377;${formatNumber(order.round_off)}</b></div><div class="grand"><span>Total Amount Including Taxes</span><b>&#8377;${formatNumber(order.grand_total)}</b></div></section><section class="terms-container"><div class="terms-body"><h3>Terms and Conditions</h3><p><b>Price:</b> ${escapeHtml(order.price_basis)}</p><p><b>Packing &amp; Forwarding:</b> ${escapeHtml(order.packing_terms)}</p><p><b>Freight &amp; Transportation:</b> ${escapeHtml(order.freight_terms)}</p><p><b>Insurance:</b> ${escapeHtml(order.insurance_terms)}</p><p><b>Delivery:</b> ${escapeHtml(order.delivery_terms)}</p><p><b>Inspection:</b> ${escapeHtml(order.inspection_terms)}</p><p><b>Guarantee / Warranty:</b> ${escapeHtml(order.warranty_terms)}</p><p><b>Payment Terms:</b> ${escapeHtml(order.payment_terms)}</p><p><b>Quantity Variance:</b> ${escapeHtml(order.quantity_variance)}</p>${order.notes ? `<p><b>Notes:</b> ${escapeHtml(order.notes)}</p>` : ""}${order.remark_1 ? `<p style="margin-top:3px;"><b>Remarks:</b> ${escapeHtml(order.remark_1)}</p>` : ""}${order.remark_2 ? `<p class="remark-red" style="color:#e5222b !important;font-weight:bold !important;margin-top:3px;"><font color="#e5222b"><b>Remarks:</b> ${escapeHtml(order.remark_2)}</font></p>` : ""}</div><div class="sign-block"><div class="company-for">For RE-Bar Couplers India Private Limited</div><div class="sign-row"><span>Prepared By</span><span>Checked By</span><span>Approved By</span></div></div></section></main></body></html>`;

    let iframe = document.getElementById("_po_print_iframe");
    if (!iframe) {
        iframe = document.createElement("iframe");
        iframe.id = "_po_print_iframe";
        iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
        document.body.appendChild(iframe);
    }
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
        const els = doc.querySelectorAll(".remark-red");
        els.forEach(el => {
            el.style.setProperty("color", "#e5222b", "important");
            el.style.setProperty("font-weight", "bold", "important");
        });
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, 300);
}

export default function PurchaseOrderSheet({ order, itemMasterList = [] }) {
    if (!order) return null;

    return (
        <div className="mx-auto rounded-xl border border-slate-300 bg-white p-6 shadow-sm text-xs text-[#0c2348]">
            {/* Company Header */}
            <div className="flex items-center gap-4 border-b-2 border-[#12386c] pb-3">
                <img
                    className="h-14 w-20 object-contain rounded border border-slate-200"
                    src={jbEngineeringLogo}
                    alt="JB Engineering"
                />
                <div>
                    <h1 className="text-xl font-bold text-[#e5222b] leading-tight">
                        RE-Bar Couplers India Private Limited
                    </h1>
                    <p className="text-[11px] font-semibold text-slate-700 mt-0.5">
                        VPO Palkwaha, Tehsil Haroli, District Una, Himachal Pradesh - 177220
                    </p>
                    <p className="text-[10px] text-slate-600">
                        HO: 10 A&amp;B, Block 23, Industrial Area, Nangal Jarialan, Distt. Una, Himachal Pradesh - 177212
                    </p>
                    <p className="text-[10px] text-slate-600">
                        Cell: +91 9888603791 · seema@jbengineeringcorporation.com · GST No. 02AAFCR5621L1ZG
                    </p>
                </div>
            </div>

            {/* Title Bar */}
            <div className="flex justify-between items-center border-b border-[#365780] py-2 font-bold text-sm">
                <span>Vendor Code: {order.vendor_code || "—"}</span>
                <span className="text-base tracking-wide">PURCHASE ORDER</span>
            </div>

            {/* Vendor & PO Metadata */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-[#9aacca] py-3 text-xs leading-relaxed">
                <div>
                    <p><b>Vendor Name:</b> {order.supplier || "—"}</p>
                    <p className="whitespace-pre-line"><b>Vendor Address:</b> {order.vendor_address || "Vendor address not provided"}</p>
                    <p><b>Contact Person / Phone:</b> {order.vendor_contact || "—"}</p>
                    <p><b>Vendor GST No.:</b> {order.vendor_gst || "—"}</p>
                </div>
                <div>
                    <p><b>PO No:</b> {order.order_number}</p>
                    <p><b>PO Date:</b> {formatDate(order.po_date || order.created_at)}</p>
                    <p><b>Reference:</b> {order.reference || "—"}</p>
                    <p>
                        <b>Status:</b>{" "}
                        <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                            {order.status}
                        </span>
                    </p>
                    {order.delivery_address && (
                        <p className="mt-1 whitespace-pre-line">
                            <b>Delivery Address:</b> {order.delivery_address}
                        </p>
                    )}
                </div>
            </div>

            <p className="py-2 text-[11px] text-slate-600">
                Please supply the following goods subject to the terms and conditions mentioned herein.
            </p>

            {/* Line Items Table */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-[#6480a4] text-xs">
                    <thead className="bg-[#e8eff8] text-center font-bold">
                        <tr>
                            <th className="border border-[#6480a4] px-2 py-1.5 w-12 text-center">Sr. No.</th>
                            <th className="border border-[#6480a4] px-3 py-1.5 text-center">Item Description</th>
                            <th className="border border-[#6480a4] px-2 py-1.5 w-20 text-center">Quantity</th>
                            <th className="border border-[#6480a4] px-2 py-1.5 w-16 text-center">U/M</th>
                            <th className="border border-[#6480a4] px-2 py-1.5 w-24 text-center">Unit Rate (INR)</th>
                            <th className="border border-[#6480a4] px-2 py-1.5 w-24 text-center">Amount (INR)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(order.items || []).map((item, index) => (
                            <tr key={item.id || item.line_number || index} className="border-t border-[#6480a4]">
                                <td className="border border-[#6480a4] px-2 py-1.5 text-center">{index + 1}</td>
                                <td className="border border-[#6480a4] px-3 py-1.5 font-medium text-center">
                                    {item.item_name || getItemOnlyName(item.item_description, itemMasterList)}
                                </td>
                                <td className="border border-[#6480a4] px-2 py-1.5 text-center">{formatNumber(item.quantity)}</td>
                                <td className="border border-[#6480a4] px-2 py-1.5 text-center">{item.uom}</td>
                                <td className="border border-[#6480a4] px-2 py-1.5 text-center">₹{formatNumber(item.unit_rate)}</td>
                                <td className="border border-[#6480a4] px-2 py-1.5 text-center font-semibold">₹{formatNumber(item.amount)}</td>
                            </tr>
                        ))}
                        {(!order.items || order.items.length === 0) && (
                            <tr>
                                <td colSpan={6} className="border border-[#6480a4] p-3 text-center text-muted-foreground">
                                    No line items in this purchase order.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Totals Section */}
            <div className="ml-auto w-full sm:w-1/2 border border-t-0 border-[#6480a4] text-xs">
                <div className="flex justify-between border-t border-[#b5c3d5] p-1.5 px-2.5">
                    <span>Total</span>
                    <b>₹{formatNumber(order.subtotal)}</b>
                </div>
                <div className="flex justify-between border-t border-[#b5c3d5] p-1.5 px-2.5">
                    <span>IGST ({order.gst_rate || 0}%)</span>
                    <b>₹{formatNumber(order.gst_amount)}</b>
                </div>
                <div className="flex justify-between border-t border-[#b5c3d5] p-1.5 px-2.5">
                    <span>Rounded off</span>
                    <b>₹{formatNumber(order.round_off)}</b>
                </div>
                <div className="flex justify-between border-t border-[#6480a4] bg-[#d8e9ff] p-2 px-2.5 text-sm font-bold text-[#0c2348]">
                    <span>Total Amount Including Taxes</span>
                    <b>₹{formatNumber(order.grand_total)}</b>
                </div>
            </div>

            {/* Terms and Conditions */}
            <div className="mt-4 border border-[#6480a4] text-xs">
                <div className="p-2.5 leading-relaxed">
                    <h3 className="font-bold text-[11px] mb-1">Terms and Conditions</h3>
                    <p><b>Price:</b> {order.price_basis || "—"}</p>
                    <p><b>Packing &amp; Forwarding:</b> {order.packing_terms || "—"}</p>
                    <p><b>Freight &amp; Transportation:</b> {order.freight_terms || "—"}</p>
                    <p><b>Insurance:</b> {order.insurance_terms || "—"}</p>
                    <p><b>Delivery:</b> {order.delivery_terms || "—"}</p>
                    <p><b>Inspection:</b> {order.inspection_terms || "—"}</p>
                    <p><b>Guarantee / Warranty:</b> {order.warranty_terms || "—"}</p>
                    <p><b>Payment Terms:</b> {order.payment_terms || "—"}</p>
                    <p><b>Quantity Variance:</b> {order.quantity_variance || "—"}</p>
                    {order.notes && <p><b>Notes:</b> {order.notes}</p>}
                    {order.remark_1 && <p className="mt-1 font-medium"><b>Remarks:</b> {order.remark_1}</p>}
                    {order.remark_2 && <p className="mt-1 font-bold text-red-600"><b>Remarks:</b> {order.remark_2}</p>}
                </div>
                <div className="border-t border-[#6480a4] p-3 text-[11px]">
                    <div className="text-right font-bold">For RE-Bar Couplers India Private Limited</div>
                    <div className="mt-10 flex justify-between font-bold text-slate-700">
                        <span>Prepared By</span>
                        <span>Checked By</span>
                        <span>Approved By</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
