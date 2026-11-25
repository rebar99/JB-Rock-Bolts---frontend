import jbEngineeringLogo from "@/assets/jb-engineering-logo.jpg";
import { Printer, Eye, FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveFileUrl } from "@/lib/api";
import { amountInWords, formatNumber, formatDate, escapeHtml } from "./PurchaseOrderSheet";

export function printMaterialReceipt(receipt) {
    if (!receipt) return;
    const isJBEC = (receipt.company || "").toLowerCase().includes("jbec");
    const companyTitle = isJBEC
        ? "JBEC CONSTRUCTION INDIA PRIVATE LIMITED"
        : "RE-Bar Couplers India Private Limited";

    const printHeaderHtml = isJBEC ? `
        <section class="company" style="border-bottom: 2px solid #2e7d32;">
            <img class="logo" src="${jbEngineeringLogo}" alt="JB Engineering"/>
            <div>
                <h1>JBEC Construction India Private Limited</h1>
                <p>HO: 10 A&amp;B, Block 23, Industrial Area, Village Nangal Jarialan, Distt. Una, Himachal Pradesh &ndash; 177212 India</p>
                <p>Cell No. +91 9434086599 &middot; Contactus@jbengineeringcorporation.com</p>
                <p>www.jbengineeringcorporation.com &middot; GST No. 02AAHCJ0645C1Z7</p>
            </div>
        </section>
    ` : `
        <section class="company">
            <img class="logo" src="${jbEngineeringLogo}" alt="JB Engineering"/>
            <div>
                <h1>RE-Bar Couplers India Private Limited</h1>
                <p>VPO Palkwaha, Tehsil Haroli, District Una, Himachal Pradesh - 177220</p>
                <p>HO: 10 A&amp;B, Block 23, Industrial Area, Nangal Jarialan, Distt. Una, Himachal Pradesh - 177212</p>
                <p>Cell No. +91 9888603791 &middot; seema@jbengineeringcorporation.com</p>
                <p>www.jbengineeringcorporation.com &middot; GST No. 02AAFCR5621L1ZG</p>
            </div>
        </section>
    `;

    const items = (receipt.lines || []).map((line, index) => {
        const ordered = `${formatNumber(line.ordered_quantity)} ${escapeHtml(line.uom || "")}`.trim();
        const received = `${formatNumber(line.received_quantity)} ${escapeHtml(line.uom || "")}`.trim();
        const meter = line.manual_meter_quantity ? `${formatNumber(line.manual_meter_quantity)} Meter` : "—";
        return `
            <tr>
                <td style="text-align:center;">${index + 1}</td>
                <td style="text-align:left;font-weight:600;">${escapeHtml(line.item_description)}</td>
                <td style="text-align:center;">${ordered}</td>
                <td style="text-align:center;font-weight:bold;">${received}</td>
                <td style="text-align:center;font-weight:bold;color:#0369a1;">${meter}</td>
                <td style="text-align:right;">&#8377;${formatNumber(line.unit_rate)}</td>
                <td style="text-align:right;font-weight:bold;">&#8377;${formatNumber(line.amount)}</td>
            </tr>
        `;
    }).join("");

    const grandTotal = Number(receipt.invoice_total || 0);
    const taxableAmount = Number(receipt.taxable_amount || 0);
    const freightCharge = Number(receipt.freight_charge || 0);
    const gstRate = Number(receipt.gst_rate || 0);
    const gstAmount = Number(receipt.gst_amount || 0);

    const html = `<!doctype html><html><head><title>MRN - ${escapeHtml(receipt.invoice_number)}</title><style>
        @page { size: A4 portrait; margin: 8mm 8mm 8mm 10mm; }
        * { box-sizing: border-box; }
        html, body { width: 100%; min-height: 100%; background: #fff; }
        body { margin: 0; padding: 4px; font-family: Arial, Helvetica, sans-serif; color: #0c2348; font-size: 11px; line-height: 1.35; }
        .sheet { width: 100%; min-height: 273mm; border: 2px solid #12386c; padding: 8px 10px; }
        .company { display: flex; align-items: center; gap: 14px; padding: 4px 0 9px; border-bottom: 2px solid #12386c; }
        .logo { width: 70px; height: 54px; border: 1px solid #d2dbe8; object-fit: contain; border-radius: 2px; }
        .company h1 { margin: 0; color: #e5222b; font-size: 20px; line-height: 1.1; }
        .company p { margin: 2px 0; font-size: 10px; font-weight: 600; }
        .title { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #365780; padding: 6px 10px; margin: 0 -10px; background: #f0f5ff; }
        .title span { font-size: 11px; font-weight: bold; color: #0c2348; }
        .title strong { font-size: 15px; letter-spacing: .5px; color: #0c2348; }
        .meta { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; border-bottom: 1px solid #9aacca; padding: 8px 10px; margin: 0 -10px; line-height: 1.6; }
        .meta p { margin: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #6480a4; padding: 5px 6px; vertical-align: middle; }
        th { background: #e8eff8; color: #0c2348; font-size: 9.5px; font-weight: bold; text-align: center; }
        tbody tr:nth-child(even) { background: #f8fbff; }
        .totals { width: 52%; margin-left: auto; border: 1px solid #6480a4; margin-top: 0; border-top: none; }
        .totals div { display: flex; justify-content: space-between; padding: 4px 8px; border-top: 1px solid #c5d2e8; }
        .totals .grand { background: #d8e9ff; color: #0c2348; font-weight: bold; font-size: 11.5px; }
        .totals .words { border-top: 2px dashed #6480a4; font-size: 10px; padding: 5px 8px; display: flex; gap: 6px; background: #f7faff; }
        .notes-box { margin-top: 10px; border: 1px solid #6480a4; padding: 6px 8px; font-size: 10.5px; }
        .sign-block { border-top: 1px solid #6480a4; padding: 12px 10px 8px; margin-top: 16px; }
        .sign-block .company-for { text-align: right; font-weight: bold; font-size: 11px; color: #0c2348; margin-bottom: 25px; }
        .sign-block .sign-row { display: flex; justify-content: space-around; align-items: flex-end; }
        .sign-block .sign-col { text-align: center; min-width: 110px; border-top: 1px solid #365780; padding-top: 4px; font-weight: bold; font-size: 10px; }
        @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .sheet { border: 2px solid #12386c !important; }
            th { background: #e8eff8 !important; color: #0c2348 !important; }
            .totals .grand { background: #d8e9ff !important; color: #0c2348 !important; }
        }
    </style></head><body>
    <main class="sheet">
        ${printHeaderHtml}
        <section class="title">
            <span>Vendor Code: ${escapeHtml(receipt.vendor_code || "—")}</span>
            <strong>MATERIAL RECEIPT NOTE (MRN)</strong>
            <span>Invoice No: ${escapeHtml(receipt.invoice_number)}</span>
        </section>
        <section class="meta">
            <div>
                <p><b>Vendor Name:</b> M/s. ${escapeHtml(receipt.vendor_name || "—")}</p>
                <p><b>Reference:</b> ${escapeHtml(receipt.reference || "—")}</p>
                <p><b>PO Payment Terms:</b> ${escapeHtml(receipt.payment_terms || "Not specified")}</p>
            </div>
            <div>
                <p><b>Purchase Order No:</b> ${escapeHtml(receipt.order_number || "—")}</p>
                <p><b>Challan / Invoice No:</b> ${escapeHtml(receipt.invoice_number)}</p>
                <p><b>Invoice / Received Date:</b> ${formatDate(receipt.invoice_date)}</p>
                <p><b>Payment Status:</b> ${escapeHtml(receipt.payment_status || "—")}</p>
            </div>
        </section>

        <table>
            <thead>
                <tr>
                    <th style="width: 32px;">Sr. No.</th>
                    <th style="text-align: left;">Item Description</th>
                    <th style="width: 75px;">Ordered Qty</th>
                    <th style="width: 80px;">Received Qty (PO)</th>
                    <th style="width: 85px;">Meter Stock</th>
                    <th style="width: 85px;">Rate (INR)</th>
                    <th style="width: 95px;">Amount (INR)</th>
                </tr>
            </thead>
            <tbody>
                ${items}
            </tbody>
        </table>

        <section class="totals">
            <div><span>Taxable Amount</span><b>&#8377;${formatNumber(taxableAmount)}</b></div>
            ${freightCharge > 0 ? `<div><span>Freight Charges</span><b>&#8377;${formatNumber(freightCharge)}</b></div>` : ""}
            <div><span>GST (${gstRate}%)</span><b>&#8377;${formatNumber(gstAmount)}</b></div>
            <div class="grand"><span>Total Amount (incl. GST)</span><b>&#8377;${formatNumber(grandTotal)}</b></div>
            <div class="words"><b>Indian Rupees:</b> <i>${amountInWords(grandTotal)} Only</i></div>
        </section>

        ${receipt.remarks ? `<div class="notes-box"><b>Remarks:</b> ${escapeHtml(receipt.remarks)}</div>` : ""}

        <div class="sign-block">
            <div class="company-for">For ${escapeHtml(companyTitle)}</div>
            <div class="sign-row">
                <div class="sign-col">Received By / Store Keeper</div>
                <div class="sign-col">Inspected &amp; Verified By</div>
                <div class="sign-col">Authorized Signatory</div>
            </div>
        </div>
    </main>
    </body></html>`;

    let iframe = document.getElementById("_mrn_print_iframe");
    if (!iframe) {
        iframe = document.createElement("iframe");
        iframe.id = "_mrn_print_iframe";
        iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
        document.body.appendChild(iframe);
    }
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, 300);
}

export default function MaterialReceiptSheet({ receipt }) {
    if (!receipt) return null;
    const isJBEC = (receipt.company || "").toLowerCase().includes("jbec");
    const companyTitle = isJBEC
        ? "JBEC CONSTRUCTION INDIA PRIVATE LIMITED"
        : "RE-Bar Couplers India Private Limited";

    const grandTotal = Number(receipt.invoice_total || 0);
    const taxableAmount = Number(receipt.taxable_amount || 0);
    const freightCharge = Number(receipt.freight_charge || 0);
    const gstRate = Number(receipt.gst_rate || 0);
    const gstAmount = Number(receipt.gst_amount || 0);
    const balance = grandTotal - Number(receipt.amount_paid || 0);

    return (
        <div className="w-full border-2 border-[#12386c] bg-white text-xs text-[#0c2348] shadow-sm">
            {/* Company Header */}
            {isJBEC ? (
                <div className="flex items-center gap-4 border-b-2 border-[#2e7d32] px-4 py-3">
                    <img
                        className="h-14 w-20 shrink-0 object-contain rounded border border-slate-200"
                        src={jbEngineeringLogo}
                        alt="JB Engineering"
                    />
                    <div>
                        <h1 className="text-xl font-bold text-[#e5222b] leading-tight">
                            JBEC Construction India Private Limited
                        </h1>
                        <p className="text-[11px] font-semibold text-slate-700 mt-0.5">
                            HO: 10 A&amp;B, Block 23, Industrial Area, Village Nangal Jarialan, Distt. Una, Himachal Pradesh – 177212 India
                        </p>
                        <p className="text-[10px] text-slate-600">
                            Cell No. +91 9434086599 · Contactus@jbengineeringcorporation.com
                        </p>
                        <p className="text-[10px] text-slate-600">
                            www.jbengineeringcorporation.com · GST No. 02AAHCJ0645C1Z7
                        </p>
                    </div>
                </div>
            ) : (
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
            )}

            {/* Title Bar */}
            <div className="flex justify-between items-center border-b border-[#365780] bg-[#f0f5ff] px-4 py-2 font-bold text-sm text-[#0c2348]">
                <span className="text-xs font-semibold">Vendor Code: {receipt.vendor_code || "—"}</span>
                <span className="text-base tracking-wider uppercase">MATERIAL RECEIPT NOTE (MRN)</span>
                <span className="text-xs font-semibold">Invoice: {receipt.invoice_number}</span>
            </div>

            {/* Vendor & Receipt Metadata */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-[#9aacca] px-4 py-3 text-xs leading-relaxed">
                <div>
                    <p><b>Vendor Name:</b> M/s. {receipt.vendor_name || "—"}</p>
                    <p><b>Reference:</b> {receipt.reference || "—"}</p>
                    <p><b>PO Payment Terms:</b> {receipt.payment_terms || "Not specified"}</p>
                </div>
                <div>
                    <p><b>PO Number:</b> {receipt.order_number || "—"}</p>
                    <p><b>Invoice / Challan No:</b> {receipt.invoice_number}</p>
                    <p><b>Invoice Date:</b> {formatDate(receipt.invoice_date)}</p>
                    <p>
                        <b>Payment Status:</b>{" "}
                        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                            receipt.payment_status === "Paid"
                                ? "bg-emerald-100 text-emerald-800"
                                : receipt.payment_status === "Overdue"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-sky-100 text-sky-800"
                        }`}>
                            {receipt.payment_status || "—"}
                        </span>
                    </p>
                </div>
            </div>

            {/* Line Items Table in A4 sheet format */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                    <thead className="bg-[#e8eff8] text-center font-bold text-[10.5px]">
                        <tr>
                            <th className="border border-[#6480a4] px-2 py-2 w-12 text-center">Sr. No.</th>
                            <th className="border border-[#6480a4] px-3 py-2 text-left">Item Description</th>
                            <th className="border border-[#6480a4] px-2 py-2 w-24 text-center">Ordered Qty</th>
                            <th className="border border-[#6480a4] px-2 py-2 w-28 text-center bg-blue-50/70">Received Qty (PO)</th>
                            <th className="border border-[#6480a4] px-2 py-2 w-28 text-center bg-cyan-50/70 text-cyan-900">Meter Stock</th>
                            <th className="border border-[#6480a4] px-2 py-2 w-24 text-right">Unit Rate (INR)</th>
                            <th className="border border-[#6480a4] px-2 py-2 w-28 text-right">Amount (INR)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(receipt.lines || []).map((line, index) => {
                            const ordered = `${formatNumber(line.ordered_quantity)} ${line.uom || ""}`.trim();
                            const received = `${formatNumber(line.received_quantity)} ${line.uom || ""}`.trim();
                            const meter = line.manual_meter_quantity ? `${formatNumber(line.manual_meter_quantity)} Meter` : "—";
                            return (
                                <tr key={line.id || index} className={index % 2 === 0 ? "bg-white" : "bg-[#f8fbff]"}>
                                    <td className="border border-[#c5d2e8] px-2 py-2 text-center text-slate-500">{index + 1}</td>
                                    <td className="border border-[#c5d2e8] px-3 py-2 text-left font-medium">
                                        <div className="font-semibold text-slate-900">{line.item_description}</div>
                                        {line.group_name && (
                                            <span className="text-[10px] text-slate-500 font-normal block">
                                                Group: {line.group_name}
                                            </span>
                                        )}
                                    </td>
                                    <td className="border border-[#c5d2e8] px-2 py-2 text-center text-slate-700">{ordered}</td>
                                    <td className="border border-[#c5d2e8] px-2 py-2 text-center font-bold text-slate-900 bg-blue-50/30">
                                        {received}
                                    </td>
                                    <td className="border border-[#c5d2e8] px-2 py-2 text-center font-bold text-cyan-800 bg-cyan-50/50">
                                        {line.manual_meter_quantity ? (
                                            <span className="inline-block rounded bg-cyan-100 text-cyan-900 border border-cyan-300 font-bold px-2 py-0.5 text-[11px]">
                                                {formatNumber(line.manual_meter_quantity)} Meter
                                            </span>
                                        ) : "—"}
                                    </td>
                                    <td className="border border-[#c5d2e8] px-2 py-2 text-right">₹{formatNumber(line.unit_rate)}</td>
                                    <td className="border border-[#c5d2e8] px-2 py-2 text-right font-bold text-slate-900">₹{formatNumber(line.amount)}</td>
                                </tr>
                            );
                        })}
                        {(!receipt.lines || receipt.lines.length === 0) && (
                            <tr>
                                <td colSpan="7" className="border border-[#c5d2e8] p-4 text-center text-muted-foreground">
                                    No item details found for this receipt.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Totals Section */}
            <div className="ml-auto w-full sm:w-[50%] border-l border-r border-b border-[#6480a4] text-xs">
                <div className="flex justify-between border-t border-[#c5d2e8] px-3 py-1.5">
                    <span>Taxable Amount</span>
                    <b>₹{formatNumber(taxableAmount)}</b>
                </div>
                {freightCharge > 0 && (
                    <div className="flex justify-between border-t border-[#c5d2e8] px-3 py-1.5">
                        <span>Freight Charge</span>
                        <b>₹{formatNumber(freightCharge)}</b>
                    </div>
                )}
                <div className="flex justify-between border-t border-[#c5d2e8] px-3 py-1.5">
                    <span>GST ({gstRate}%)</span>
                    <b>₹{formatNumber(gstAmount)}</b>
                </div>
                <div className="flex justify-between border-t border-[#c5d2e8] px-3 py-2 bg-[#d8e9ff] font-bold text-sm text-[#0c2348]">
                    <span>Total Amount (incl. GST)</span>
                    <span>₹{formatNumber(grandTotal)}</span>
                </div>
                <div className="flex gap-2 border-t border-[#c5d2e8] px-3 py-1.5 bg-[#f7faff] text-[10.5px]">
                    <span className="font-bold whitespace-nowrap">Indian Rupees:</span>
                    <i className="text-slate-700">{amountInWords(grandTotal)} Only</i>
                </div>
            </div>

            {/* Payment & Remarks Info */}
            <div className="border-t border-[#6480a4] px-4 py-3 bg-slate-50/50 space-y-2 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <span className="text-slate-500 font-medium">Amount Paid:</span>{" "}
                        <strong className="text-emerald-700">₹{formatNumber(receipt.amount_paid || 0)}</strong>
                    </div>
                    <div>
                        <span className="text-slate-500 font-medium">Balance Pending:</span>{" "}
                        <strong className={balance > 0 ? "text-amber-700" : "text-emerald-700"}>
                            ₹{formatNumber(Math.max(0, balance))}
                        </strong>
                    </div>
                    <div>
                        <span className="text-slate-500 font-medium">Due Date:</span>{" "}
                        <strong>{receipt.payment_due_date ? formatDate(receipt.payment_due_date) : "—"}</strong>
                    </div>
                </div>
                {receipt.remarks && (
                    <div className="pt-1 border-t border-slate-200">
                        <span className="font-semibold text-slate-700">Remarks: </span>
                        <span className="text-slate-600">{receipt.remarks}</span>
                    </div>
                )}
            </div>

            {/* Signatures block */}
            <div className="border-t border-[#6480a4] px-4 py-4 mt-2">
                <div className="text-right font-bold text-xs text-[#0c2348] mb-8">
                    For {companyTitle}
                </div>
                <div className="grid grid-cols-3 gap-6 text-center text-[10.5px]">
                    <div>
                        <div className="border-t border-[#365780] pt-1.5 font-bold">Received By / Store</div>
                        <div className="text-[10px] text-slate-500">{receipt.created_by || "Store Keeper"}</div>
                    </div>
                    <div>
                        <div className="border-t border-[#365780] pt-1.5 font-bold">Inspected &amp; Verified By</div>
                        <div className="text-[10px] text-slate-500">Quality / Store Incharge</div>
                    </div>
                    <div>
                        <div className="border-t border-[#365780] pt-1.5 font-bold">Authorized Signatory</div>
                        <div className="text-[10px] text-slate-500">Plant / Commercial Head</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
