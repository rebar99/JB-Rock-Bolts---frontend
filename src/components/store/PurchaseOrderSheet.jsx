import jbEngineeringLogo from "@/assets/jb-engineering-logo.jpg";
import { resolveFileUrl } from "@/lib/api";

export const formatNumber = value => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const formatDate = value => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const escapeHtml = value => String(value ?? "—").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

export function amountInWords(amount) {
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
        "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    function words(n) {
        if (n === 0) return "";
        if (n < 20) return ones[n] + " ";
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "") + " ";
        if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred " + words(n % 100);
        if (n < 100000) return words(Math.floor(n / 1000)) + "Thousand " + words(n % 1000);
        if (n < 10000000) return words(Math.floor(n / 100000)) + "Lakh " + words(n % 100000);
        return words(Math.floor(n / 10000000)) + "Crore " + words(n % 10000000);
    }
    const rounded = Math.round(amount * 100) / 100;
    const rupees = Math.floor(rounded);
    const paisa = Math.round((rounded - rupees) * 100);
    let result = words(rupees).trim();
    if (paisa > 0) result += " and " + words(paisa).trim() + " Paisa";
    return result.replace(/\s+/g, " ").trim();
}

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

    // ── Build dynamic sign block ──────────────────────────────────────────────
    const sc = order.signature_config || {};
    const BASE_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    const resolveUrl = (url) => {
        if (!url) return null;
        if (/^https?:\/\//.test(url)) return url;
        return `${BASE_URL}${url.startsWith("/") ? url : "/" + url}`;
    };
    const sigImg = (url, alt) => url ? `<img src="${resolveUrl(url)}" alt="${alt}" style="max-height:44px;max-width:90px;object-fit:contain;display:block;margin:0 auto 3px"/>` : `<div style="height:48px"></div>`;

    // Multiple Prepared By
    const preparedByList = Array.isArray(sc.prepared_by_list) ? sc.prepared_by_list : (sc.prepared_by ? [sc.prepared_by] : []);
    const preparedByHtmlParts = preparedByList.map(pb => `
        <div style="flex:1;text-align:center;min-width:80px">
            ${sigImg(pb.signature_url, pb.user_name || 'Prepared By')}
            <div style="border-top:1px solid #365780;padding-top:3px;font-weight:bold;font-size:10px">Prepared By</div>
            ${pb.user_name ? `<div style="font-size:9px;color:#444;margin-top:1px">${escapeHtml(pb.user_name)}</div>` : ''}
        </div>`);
    // Fallback if none configured
    if (preparedByHtmlParts.length === 0) preparedByHtmlParts.push(`<div style="flex:1;text-align:center;min-width:80px"><div style="height:48px"></div><div style="border-top:1px solid #365780;padding-top:3px;font-weight:bold;font-size:10px">Prepared By</div></div>`);

    const checkedByHtml = `
        <div style="flex:1;text-align:center;min-width:80px">
            ${sc.checked_by?.approved ? sigImg(sc.checked_by?.signature_url, "Checked By") : `<div style="height:48px"></div>`}
            <div style="border-top:1px solid #365780;padding-top:3px;font-weight:bold;font-size:10px">Checked By</div>
            ${sc.checked_by?.approved && sc.checked_by?.user_name ? `<div style="font-size:9px;color:#444;margin-top:1px">${escapeHtml(sc.checked_by.user_name)}</div>` : ''}
        </div>`;
    const approvedByHtml = `
        <div style="flex:1;text-align:center;min-width:80px">
            ${sc.approved_by?.approved ? sigImg(sc.approved_by?.signature_url, "Approved By") : `<div style="height:48px"></div>`}
            <div style="border-top:1px solid #365780;padding-top:3px;font-weight:bold;font-size:10px">Approved By</div>
            ${sc.approved_by?.approved && sc.approved_by?.user_name ? `<div style="font-size:9px;color:#444;margin-top:1px">${escapeHtml(sc.approved_by.user_name)}</div>` : ''}
        </div>`;
    const signBlockHtml = `<div class="sign-block"><div class="company-for">For RE-Bar Couplers India Private Limited</div><div class="sign-row" style="align-items:flex-end;gap:8px">${preparedByHtmlParts.join('')}${checkedByHtml}${approvedByHtml}</div></div>`;

    const html = `<!doctype html><html><head><title>PO ${escapeHtml(order.order_number)}</title><style>@page{size:A4 portrait;margin:8mm 8mm 8mm 10mm}*{box-sizing:border-box}html,body{width:100%;min-height:100%;background:#fff}body{margin:0;padding:4px;font-family:Arial,Helvetica,sans-serif;color:#0c2348;font-size:11px;line-height:1.35}.sheet{width:100%;min-height:273mm;border:2px solid #12386c;padding:8px 10px}.company{display:flex;align-items:center;gap:14px;padding:4px 0 9px;border-bottom:2px solid #12386c}.logo{width:70px;height:54px;border:1px solid #d2dbe8;object-fit:contain;border-radius:2px}.company h1{margin:0;color:#e5222b;font-size:20px;line-height:1.1}.company p{margin:2px 0;font-size:10px;font-weight:600}.title{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #365780;padding:6px 10px;margin:0 -10px}.title span{font-size:11px;font-weight:600;color:#0c2348}.title strong{font-size:17px;letter-spacing:.3px;color:#0c2348}.meta{display:grid;grid-template-columns:1.65fr 1fr;gap:12px;border-bottom:1px solid #9aacca;padding:8px 10px;margin:0 -10px;line-height:1.6}.meta p{margin:0}.intro{margin:8px 0 5px;font-size:10px;font-style:italic;color:#365780}table{width:100%;border-collapse:collapse;margin-top:2px}th,td{border:1px solid #6480a4;padding:5px 6px;vertical-align:middle;text-align:center}th{background:#e8eff8;color:#0c2348;font-size:9.5px;font-weight:bold}tbody tr:nth-child(even){background:#f0f5ff}.right{text-align:right}.totals{width:46%;margin-left:auto;border:1px solid #6480a4;margin-top:0}.totals div{display:flex;justify-content:space-between;padding:5px 8px;border-top:1px solid #c5d2e8}.totals .grand{background:#d8e9ff;color:#0c2348;font-weight:bold;font-size:11.5px}.totals .grand b{color:#0c2348}.totals .words{border-top:2px dashed #6480a4;font-size:10px;padding:5px 8px;display:flex;gap:6px;background:#f7faff}.terms-container{margin-top:10px;border:1px solid #6480a4;width:100%}.terms-body{padding:7px 9px;line-height:1.55}.terms-body h3{margin:0 0 4px;font-size:11px;color:#12386c;border-bottom:1px solid #9aacca;padding-bottom:3px}.terms-body p{margin:1px 0}.remark-red{color:#e5222b !important;font-weight:bold !important}.sign-block{border-top:1px solid #6480a4;padding:8px 12px 10px;font-size:10px}.sign-block .company-for{text-align:right;font-weight:bold;font-size:11px;color:#0c2348}.sign-block .sign-row{display:flex;justify-content:space-around;align-items:flex-end;margin-top:12px;padding:0 5px;gap:8px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.remark-red, .remark-red font{color:#e5222b !important;font-weight:bold !important}.sheet{border:2px solid #12386c !important}.totals{border:1px solid #6480a4 !important}.terms-container{border:1px solid #6480a4 !important}th{background:#e8eff8 !important;color:#0c2348 !important}.totals .grand{background:#d8e9ff !important;color:#0c2348 !important}.totals .grand b{color:#0c2348 !important}}</style></head><body><main class="sheet"><section class="company"><img class="logo" src="${jbEngineeringLogo}" alt="JB Engineering"/><div><h1>RE-Bar Couplers India Private Limited</h1><p>VPO Palkwaha, Tehsil Haroli, District Una, Himachal Pradesh - 177220</p><p>HO: 10 A&amp;B, Block 23, Industrial Area, Nangal Jarialan, Distt. Una, Himachal Pradesh - 177212</p><p>Cell No. +91 9888603791 &middot; seema@jbengineeringcorporation.com</p><p>www.jbengineeringcorporation.com &middot; GST No. 02AAFCR5621L1ZG</p></div></section><section class="title"><span>Vendor Code: ${escapeHtml(order.vendor_code)}</span><strong>PURCHASE ORDER</strong></section><section class="meta"><div><p><b>Vendor Name:</b> ${escapeHtml(order.supplier)}</p><p><b>Vendor Address:</b> ${escapeHtml(order.vendor_address || "Vendor address not provided").replace(/\n/g, "<br/>")}</p><p><b>Contact Person / Phone:</b> ${escapeHtml(order.vendor_contact)}</p><p><b>Vendor GST No.:</b> ${escapeHtml(order.vendor_gst)}</p></div><div><p><b>PO No:</b> ${escapeHtml(order.order_number)}</p><p><b>PO Date:</b> ${formatDate(order.po_date || order.created_at)}</p><p><b>Reference:</b> ${escapeHtml(order.reference)}</p><p><b>Status:</b> ${escapeHtml(order.status)}</p>${order.delivery_address ? `<p><b>Delivery Address:</b> ${escapeHtml(order.delivery_address).replace(/\n/g, "<br/>")}</p>` : ""}</div></section><p class="intro">Please supply the following goods subject to the terms and conditions mentioned herein.</p><table><thead><tr><th>Sr. No.</th><th>Item Description</th><th>Quantity</th><th>U/M</th><th>Unit Rate (INR)</th><th>Amount (INR)</th></tr></thead><tbody>${items}</tbody></table><section class="totals" style="border-left:1px solid #6480a4"><div><span>Total</span><b>&#8377;${formatNumber(order.subtotal)}</b></div><div><span>IGST (${order.gst_rate || 0}%)</span><b>&#8377;${formatNumber(order.gst_amount)}</b></div><div><span>Rounded off</span><b>&#8377;${formatNumber(order.round_off)}</b></div><div class="grand"><span>Total Amount Including Taxes</span><b>&#8377;${formatNumber(order.grand_total)}</b></div><div class="words"><b style="white-space:nowrap">Indian Rupees :-</b> <i>${amountInWords(order.grand_total || 0)} Only</i></div></section><section class="terms-container"><div class="terms-body"><h3>Terms and Conditions</h3><p><b>Price:</b> ${escapeHtml(order.price_basis)}</p><p><b>Packing &amp; Forwarding:</b> ${escapeHtml(order.packing_terms)}</p><p><b>Freight &amp; Transportation:</b> ${escapeHtml(order.freight_terms)}</p><p><b>Insurance:</b> ${escapeHtml(order.insurance_terms)}</p><p><b>Delivery:</b> ${escapeHtml(order.delivery_terms)}</p><p><b>Inspection:</b> ${escapeHtml(order.inspection_terms)}</p><p><b>Guarantee / Warranty:</b> ${escapeHtml(order.warranty_terms)}</p><p><b>Payment Terms:</b> ${escapeHtml(order.payment_terms)}</p><p><b>Quantity Variance:</b> ${escapeHtml(order.quantity_variance)}</p>${order.notes ? `<p><b>Notes:</b> ${escapeHtml(order.notes)}</p>` : ""}${order.remark_1 ? `<p style="margin-top:3px;"><b>Remarks:</b> ${escapeHtml(order.remark_1)}</p>` : ""}${order.remark_2 ? `<p class="remark-red" style="color:#e5222b !important;font-weight:bold !important;margin-top:3px;"><font color="#e5222b"><b>Remarks:</b> ${escapeHtml(order.remark_2)}</font></p>` : ""}</div>${signBlockHtml}</section></main></body></html>`;

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
        <div className="mx-auto border-2 border-[#12386c] bg-white text-xs text-[#0c2348] shadow-lg">

            {/* Company Header */}
            <div className="flex items-center gap-4 border-b-2 border-[#12386c] px-4 py-3">
                <img
                    className="h-14 w-20 shrink-0 object-contain rounded border border-slate-200"
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
            <div className="flex justify-between items-center border-b border-[#365780] px-4 py-2 font-bold text-sm text-[#0c2348]">
                <span className="text-xs font-semibold">Vendor Code: {order.vendor_code || "—"}</span>
                <span className="text-base tracking-wide">PURCHASE ORDER</span>
            </div>

            {/* Vendor & PO Metadata */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-[#9aacca] px-4 py-3 text-xs leading-relaxed">
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

            {/* Intro line */}
            <p className="px-4 py-2 text-[10.5px] italic text-[#365780]">
                Please supply the following goods subject to the terms and conditions mentioned herein.
            </p>

            {/* Line Items Table */}
            <div className="overflow-x-auto border-t border-[#6480a4]">
                <table className="w-full border-collapse text-xs">
                    <thead className="bg-[#e8eff8] text-center font-bold text-[10px]">
                        <tr>
                            <th className="border border-[#6480a4] px-2 py-1.5 w-12">Sr. No.</th>
                            <th className="border border-[#6480a4] px-3 py-1.5">Item Description</th>
                            <th className="border border-[#6480a4] px-2 py-1.5 w-20">Quantity</th>
                            <th className="border border-[#6480a4] px-2 py-1.5 w-16">U/M</th>
                            <th className="border border-[#6480a4] px-2 py-1.5 w-28">Unit Rate (INR)</th>
                            <th className="border border-[#6480a4] px-2 py-1.5 w-28">Amount (INR)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(order.items || []).map((item, index) => (
                            <tr key={item.id || item.line_number || index}
                                className={index % 2 === 0 ? "bg-white" : "bg-[#f0f5ff]"}>
                                <td className="border border-[#c5d2e8] px-2 py-1.5 text-center">{index + 1}</td>
                                <td className="border border-[#c5d2e8] px-3 py-1.5 font-medium text-center">
                                    {item.item_name || getItemOnlyName(item.item_description, itemMasterList)}
                                </td>
                                <td className="border border-[#c5d2e8] px-2 py-1.5 text-center">{formatNumber(item.quantity)}</td>
                                <td className="border border-[#c5d2e8] px-2 py-1.5 text-center">{item.uom}</td>
                                <td className="border border-[#c5d2e8] px-2 py-1.5 text-center">₹{formatNumber(item.unit_rate)}</td>
                                <td className="border border-[#c5d2e8] px-2 py-1.5 text-center font-semibold">₹{formatNumber(item.amount)}</td>
                            </tr>
                        ))}
                        {(!order.items || order.items.length === 0) && (
                            <tr>
                                <td colSpan={6} className="border border-[#c5d2e8] p-3 text-center text-muted-foreground">
                                    No line items in this purchase order.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Totals Section */}
            <div className="ml-auto w-full sm:w-[46%] border-l border-r border-b border-[#6480a4] text-xs">
                <div className="flex justify-between border-t border-[#c5d2e8] px-3 py-1.5">
                    <span>Total</span>
                    <b>₹{formatNumber(order.subtotal)}</b>
                </div>
                <div className="flex justify-between border-t border-[#c5d2e8] px-3 py-1.5">
                    <span>IGST ({order.gst_rate || 0}%)</span>
                    <b>₹{formatNumber(order.gst_amount)}</b>
                </div>
                <div className="flex justify-between border-t border-[#c5d2e8] px-3 py-1.5">
                    <span>Rounded off</span>
                    <b>₹{formatNumber(order.round_off)}</b>
                </div>
                <div className="flex justify-between border-t border-[#6480a4] bg-[#d8e9ff] px-3 py-2 font-bold text-[#0c2348] text-sm">
                    <span>Total Amount Including Taxes</span>
                    <span>₹{formatNumber(order.grand_total)}</span>
                </div>
                <div className="flex gap-2 border-t border-dashed border-[#6480a4] px-3 py-2 text-xs text-[#0c2348]">
                    <span className="shrink-0 font-bold whitespace-nowrap">Indian Rupees :-</span>
                    <span className="italic font-medium">{amountInWords(order.grand_total || 0)} Only</span>
                </div>
            </div>

            {/* Terms and Conditions */}
            <div className="mt-3 border border-[#6480a4] text-xs mx-0">
                <div className="px-3 py-1.5 border-b border-[#9aacca]">
                    <h3 className="font-bold text-[11px] text-[#0c2348]">Terms and Conditions</h3>
                </div>
                <div className="px-3 py-2 leading-relaxed grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5">
                    <p><b>Price:</b> {order.price_basis || "—"}</p>
                    <p><b>Packing &amp; Forwarding:</b> {order.packing_terms || "—"}</p>
                    <p><b>Freight &amp; Transportation:</b> {order.freight_terms || "—"}</p>
                    <p><b>Insurance:</b> {order.insurance_terms || "—"}</p>
                    <p><b>Delivery:</b> {order.delivery_terms || "—"}</p>
                    <p><b>Inspection:</b> {order.inspection_terms || "—"}</p>
                    <p><b>Guarantee / Warranty:</b> {order.warranty_terms || "—"}</p>
                    <p><b>Payment Terms:</b> {order.payment_terms || "—"}</p>
                    <p><b>Quantity Variance:</b> {order.quantity_variance || "—"}</p>
                    {order.notes && <p className="sm:col-span-2"><b>Notes:</b> {order.notes}</p>}
                    {order.remark_1 && <p className="sm:col-span-2 mt-0.5 font-medium"><b>Remarks:</b> {order.remark_1}</p>}
                    {order.remark_2 && <p className="sm:col-span-2 mt-0.5 font-bold text-red-600"><b>Remarks:</b> {order.remark_2}</p>}
                </div>
                <div className="border-t border-[#6480a4] px-4 pb-4 pt-2 text-[11px]">
                    <div className="text-right font-bold text-[#0c2348]">For RE-Bar Couplers India Private Limited</div>
                    <div className="mt-4 flex flex-wrap justify-around gap-4 px-2">
                        {/* Prepared By — multiple */}
                        {(() => {
                            const list = Array.isArray(order.signature_config?.prepared_by_list)
                                ? order.signature_config.prepared_by_list
                                : (order.signature_config?.prepared_by ? [order.signature_config.prepared_by] : []);
                            return list.length > 0 ? list.map((pb) => (
                                <div key={pb.user_id} className="flex flex-col items-center gap-1 flex-1 min-w-[70px]">
                                    {pb.signature_url
                                        ? <img src={resolveFileUrl(pb.signature_url)} alt={pb.user_name} className="max-h-12 max-w-[90px] object-contain mb-1" />
                                        : <div className="h-12" />}
                                    <span className="border-t border-[#365780] pt-1 w-full text-center font-bold">Prepared By</span>
                                    <span className="text-[10px] text-slate-500">{pb.user_name}</span>
                                </div>
                            )) : (
                                <div className="flex flex-col items-center gap-1 flex-1 min-w-[70px]">
                                    <div className="h-12" />
                                    <span className="border-t border-[#365780] pt-1 w-full text-center font-bold">Prepared By</span>
                                </div>
                            );
                        })()}
                        {/* Checked By */}
                        <div className="flex flex-col items-center gap-1 flex-1 min-w-[70px]">
                            {order.signature_config?.checked_by?.approved && order.signature_config?.checked_by?.signature_url
                                ? <img src={resolveFileUrl(order.signature_config.checked_by.signature_url)} alt="Checked By" className="max-h-12 max-w-[90px] object-contain mb-1" />
                                : <div className="h-12" />}
                            <span className="border-t border-[#365780] pt-1 w-full text-center font-bold">Checked By</span>
                            {order.signature_config?.checked_by?.approved && order.signature_config?.checked_by?.user_name &&
                                <span className="text-[10px] text-slate-500">{order.signature_config.checked_by.user_name}</span>}
                        </div>
                        {/* Approved By */}
                        <div className="flex flex-col items-center gap-1 flex-1 min-w-[70px]">
                            {order.signature_config?.approved_by?.approved && order.signature_config?.approved_by?.signature_url
                                ? <img src={resolveFileUrl(order.signature_config.approved_by.signature_url)} alt="Approved By" className="max-h-12 max-w-[90px] object-contain mb-1" />
                                : <div className="h-12" />}
                            <span className="border-t border-[#365780] pt-1 w-full text-center font-bold">Approved By</span>
                            {order.signature_config?.approved_by?.approved && order.signature_config?.approved_by?.user_name &&
                                <span className="text-[10px] text-slate-500">{order.signature_config.approved_by.user_name}</span>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
