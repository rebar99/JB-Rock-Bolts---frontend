import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConstants } from "@/lib/constants";
import { fetchReport, fetchFulfillmentReport, fetchPendingPOs, exportCombinedReport, importCombinedReport } from "@/lib/api";
import { inr } from "@/lib/format";
import { toast } from "sonner";
import { Download, Upload, IndianRupee, Package, TrendingUp, ClipboardList, BarChart3, Clock, FileText, UploadCloud } from "lucide-react";

const SHEET_OPTIONS = [
    { id: "fulfillment", label: "Fulfillment Report", desc: "PO fulfillment status per item" },
    { id: "sales",       label: "Sales Report",       desc: "Invoice records with payment status" },
    { id: "pending-pos", label: "Pending POs Report", desc: "Open purchase orders with pending values" },
];

const Reports = () => {
    const qc = useQueryClient();
    const { products } = useConstants();
    const [tab, setTab] = useState("fulfillment");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [product, setProduct] = useState("all");
    const [client, setClient] = useState("all");

    // ── Combined export dialog ────────────────────────────────────────────────
    const [exportOpen, setExportOpen] = useState(false);
    const [exportSheets, setExportSheets] = useState(["fulfillment", "sales", "pending-pos"]);
    const [exportFrom, setExportFrom] = useState("");
    const [exportTo, setExportTo] = useState("");
    const [exporting, setExporting] = useState(false);

    const toggleSheet = (id, checked) =>
        setExportSheets(prev => checked ? [...prev, id] : prev.filter(s => s !== id));

    const handleCombinedExport = async () => {
        if (exportSheets.length === 0) return toast.error("Select at least one report section");
        setExporting(true);
        const tid = toast.loading("Preparing combined Excel export…");
        try {
            const params = {};
            if (exportFrom) params.from_date = new Date(exportFrom).toISOString();
            if (exportTo)   params.to_date   = new Date(exportTo).toISOString();
            await exportCombinedReport(exportSheets, params);
            toast.success(
                `Exported ${exportSheets.length} sheet${exportSheets.length > 1 ? "s" : ""} to Excel`,
                { id: tid }
            );
            setExportOpen(false);
        } catch (err) {
            toast.error("Export failed: " + err.message, { id: tid });
        } finally {
            setExporting(false);
        }
    };

    // ── Combined import dialog ────────────────────────────────────────────────
    const [importOpen, setImportOpen] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importConflict, setImportConflict] = useState("skip");
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const importFileRef = useRef(null);

    const openImport = () => {
        setImportFile(null);
        setImportResult(null);
        setImportOpen(true);
    };

    const handleImport = async () => {
        if (!importFile) return toast.error("Please select an Excel (.xlsx) file");
        setImporting(true);
        const tid = toast.loading("Importing…");
        try {
            const result = await importCombinedReport(importFile, importConflict);
            setImportResult(result);
            toast.success(
                `Import done — Created: ${result.created}, Updated: ${result.updated}, Skipped: ${result.skipped}`,
                { id: tid, duration: 6000 }
            );
            qc.invalidateQueries({ queryKey: ["report"] });
            qc.invalidateQueries({ queryKey: ["fulfillmentReport"] });
            qc.invalidateQueries({ queryKey: ["pendingPOsReport"] });
            qc.invalidateQueries({ queryKey: ["purchase-orders"] });
            qc.invalidateQueries({ queryKey: ["sales"] });
        } catch (err) {
            toast.error("Import failed: " + err.message, { id: tid });
        } finally {
            setImporting(false);
        }
    };

    // ── Query params ──────────────────────────────────────────────────────────
    const salesParams = {
        from_date: from ? new Date(from).toISOString() : undefined,
        to_date:   to   ? new Date(to).toISOString()   : undefined,
        product:   product !== "all" ? product : undefined,
        client:    client  !== "all" ? client  : undefined,
    };
    const fulfillmentParams = {
        from_date: from ? new Date(from).toISOString() : undefined,
        to_date:   to   ? new Date(to).toISOString()   : undefined,
        client:    client !== "all" ? client : undefined,
    };

    const { data: salesData,       isLoading: salesLoading }       = useQuery({ queryKey: ["report", salesParams],            queryFn: () => fetchReport(salesParams),          enabled: tab === "sales" });
    const { data: fulfillmentData, isLoading: fulfillmentLoading } = useQuery({ queryKey: ["fulfillmentReport", fulfillmentParams], queryFn: () => fetchFulfillmentReport(fulfillmentParams), enabled: tab === "fulfillment" });
    const { data: pendingData,     isLoading: pendingLoading }     = useQuery({ queryKey: ["pendingPOsReport"],                queryFn: fetchPendingPOs,                         enabled: tab === "pending" });

    return (
        <div className="space-y-6">
            {/* ── Page header ─────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Reports & Analytics</h2>
                    <p className="text-sm text-muted-foreground mt-1">Analyze your sales performance and order fulfillment.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setExportOpen(true)} variant="outline" className="border-green-500 text-green-700 hover:bg-green-50">
                        <Download className="h-4 w-4 mr-2" /> Export Excel
                    </Button>
                    <Button onClick={openImport} variant="outline" className="border-blue-500 text-blue-700 hover:bg-blue-50">
                        <Upload className="h-4 w-4 mr-2" /> Import Excel
                    </Button>
                </div>
            </div>

            {/* ── Report tabs ─────────────────────────────────────────────────── */}
            <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6 p-1 bg-muted/50 rounded-xl">
                    <TabsTrigger value="fulfillment" className="rounded-lg py-2 transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <ClipboardList className="h-4 w-4 mr-2" /> Fulfillment
                    </TabsTrigger>
                    <TabsTrigger value="sales" className="rounded-lg py-2 transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <BarChart3 className="h-4 w-4 mr-2" /> Sales
                    </TabsTrigger>
                    <TabsTrigger value="pending" className="rounded-lg py-2 transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Clock className="h-4 w-4 mr-2" /> Pending POs
                    </TabsTrigger>
                </TabsList>

                {/* ── Fulfillment Tab ──────────────────────────────────────────── */}
                <TabsContent value="fulfillment" className="space-y-6">
                    <Card className="p-5 shadow-card">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>From Date</Label>
                                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>To Date</Label>
                                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Search Client</Label>
                                <Input placeholder="Filter by client..." value={client === "all" ? "" : client}
                                    onChange={(e) => setClient(e.target.value || "all")} />
                            </div>
                        </div>
                    </Card>
                    <Card className="shadow-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-muted-foreground text-[11px] uppercase tracking-wider">
                                    <tr>
                                        <th className="text-left font-semibold px-2 py-3">Date</th>
                                        <th className="text-left font-semibold px-2 py-3">Client Name</th>
                                        <th className="text-left font-semibold px-2 py-3">Project Name</th>
                                        <th className="text-left font-semibold px-2 py-3">Item</th>
                                        <th className="text-right font-semibold px-2 py-3">Req.</th>
                                        <th className="text-right font-semibold px-2 py-3">Del.</th>
                                        <th className="text-right font-semibold px-2 py-3">Pend.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {fulfillmentLoading && <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>}
                                    {fulfillmentData?.rows.map((r) => (
                                        <tr key={r.id} className="border-t border-border hover:bg-muted/30 transition-colors text-[12.5px]">
                                            <td className="px-2 py-3 text-muted-foreground whitespace-nowrap">{r.date}</td>
                                            <td className="px-2 py-3 font-semibold text-foreground truncate max-w-[120px]" title={r.client_name}>{r.client_name}</td>
                                            <td className="px-2 py-3 text-muted-foreground truncate max-w-[100px]" title={r.project}>{r.project}</td>
                                            <td className="px-2 py-3 text-foreground font-medium truncate max-w-[140px]" title={r.item}>{r.item}</td>
                                            <td className="px-2 py-3 text-right font-medium whitespace-nowrap">{r.total_required} <span className="text-[10px] text-muted-foreground">{r.uom}</span></td>
                                            <td className="px-2 py-3 text-right font-bold text-success whitespace-nowrap">{r.delivered} <span className="text-[10px] text-muted-foreground">{r.uom}</span></td>
                                            <td className="px-2 py-3 text-right font-bold text-orange-500 whitespace-nowrap">{r.pending} <span className="text-[10px] text-muted-foreground">{r.uom}</span></td>
                                        </tr>
                                    ))}
                                    {!fulfillmentLoading && fulfillmentData?.rows.length === 0 && (
                                        <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">No records found.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </TabsContent>

                {/* ── Sales Tab ────────────────────────────────────────────────── */}
                <TabsContent value="sales" className="space-y-6">
                    <Card className="p-5 shadow-card">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>From Date</Label>
                                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>To Date</Label>
                                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                            </div>
                        </div>
                    </Card>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Card className="p-5 shadow-card border-l-4 border-primary">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-primary/10 grid place-items-center"><IndianRupee className="h-5 w-5 text-primary" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Filtered Revenue</div>
                                    <div className="text-2xl font-bold text-foreground">{inr(salesData?.total_revenue ?? 0)}</div>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-5 shadow-card border-l-4 border-accent">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-accent/15 grid place-items-center"><Package className="h-5 w-5 text-accent" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Records</div>
                                    <div className="text-2xl font-bold text-foreground">{salesData?.record_count ?? 0}</div>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-5 shadow-card border-l-4 border-success">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-success/15 grid place-items-center"><TrendingUp className="h-5 w-5 text-success" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Avg Order Value</div>
                                    <div className="text-2xl font-bold text-foreground">{inr(salesData?.avg_order_value ?? 0)}</div>
                                </div>
                            </div>
                        </Card>
                    </div>
                    <Card className="shadow-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-muted-foreground text-[11px] uppercase tracking-wider">
                                    <tr>
                                        <th className="text-left font-semibold px-2 py-3">Date</th>
                                        <th className="text-left font-semibold px-2 py-3">Invoice No</th>
                                        <th className="text-left font-semibold px-2 py-3">PO No</th>
                                        <th className="text-right font-semibold px-2 py-3">Grand Total</th>
                                        <th className="text-left font-semibold px-2 py-3">Payment</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {salesLoading && <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>}
                                    {salesData?.rows.map((r) => (
                                        <tr key={r.id} className="border-t border-border hover:bg-muted/30 transition-colors text-[12.5px]">
                                            <td className="px-2 py-3 text-muted-foreground whitespace-nowrap">{r.date}</td>
                                            <td className="px-2 py-3 text-primary font-medium truncate max-w-[120px]" title={r.invoice_number}>{r.invoice_number || "—"}</td>
                                            <td className="px-2 py-3 text-muted-foreground truncate max-w-[120px]" title={r.po_number}>{r.po_number || "—"}</td>
                                            <td className="px-2 py-3 text-right font-bold text-foreground">{inr(r.price)}</td>
                                            <td className="px-2 py-3 text-muted-foreground text-[11px]">{r.payment_status}</td>
                                        </tr>
                                    ))}
                                    {!salesLoading && (!salesData || salesData.rows.length === 0) && (
                                        <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">No records match the filters.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </TabsContent>

                {/* ── Pending POs Tab ──────────────────────────────────────────── */}
                <TabsContent value="pending" className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="p-5 shadow-card border-l-4 border-slate-500">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-slate-500/10 grid place-items-center"><IndianRupee className="h-5 w-5 text-slate-500" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Original Subtotal</div>
                                    <div className="text-xl font-bold text-foreground">{inr(pendingData?.total_subtotal ?? 0)}</div>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-5 shadow-card border-l-4 border-blue-500">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-blue-500/10 grid place-items-center"><TrendingUp className="h-5 w-5 text-blue-500" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Original GST</div>
                                    <div className="text-xl font-bold text-foreground">{inr(pendingData?.total_gst ?? 0)}</div>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-5 shadow-card border-l-4 border-primary">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-primary/10 grid place-items-center"><Package className="h-5 w-5 text-primary" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Original Value</div>
                                    <div className="text-xl font-bold text-foreground">{inr(pendingData?.total_value ?? 0)}</div>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-5 shadow-card border-l-4 border-indigo-500">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-indigo-500/10 grid place-items-center"><ClipboardList className="h-5 w-5 text-indigo-500" /></div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Pending POs</div>
                                    <div className="text-xl font-bold text-foreground">{pendingData?.count ?? 0}</div>
                                </div>
                            </div>
                        </Card>
                    </div>
                    <Card className="shadow-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-muted-foreground text-[11px] uppercase tracking-wider">
                                    <tr>
                                        <th className="text-left font-semibold px-2 py-3">Date</th>
                                        <th className="text-left font-semibold px-2 py-3">PO Number</th>
                                        <th className="text-left font-semibold px-2 py-3">Client</th>
                                        <th className="text-left font-semibold px-2 py-3">Item</th>
                                        <th className="text-right font-semibold px-2 py-3">Value (Excl. GST)</th>
                                        <th className="text-right font-semibold px-2 py-3">GST Amount</th>
                                        <th className="text-right font-semibold px-2 py-3">Total Value</th>
                                        <th className="text-left font-semibold px-2 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendingLoading && <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>}
                                    {pendingData?.rows.map((r) => (
                                        <tr key={r.id} className="border-t border-border hover:bg-muted/30 transition-colors text-[12.5px]">
                                            <td className="px-2 py-3 text-muted-foreground whitespace-nowrap">{r.date}</td>
                                            <td className="px-2 py-3 font-semibold text-primary truncate max-w-[120px]" title={r.po_number}>{r.po_number}</td>
                                            <td className="px-2 py-3 text-muted-foreground truncate max-w-[120px]" title={r.client_name}>{r.client_name}</td>
                                            <td className="px-2 py-3 text-muted-foreground truncate max-w-[140px]" title={r.item}>{r.item}</td>
                                            <td className="px-2 py-3 text-right font-medium">{inr(r.subtotal)}</td>
                                            <td className="px-2 py-3 text-right font-medium text-blue-500">{inr(r.gst_amount)}</td>
                                            <td className="px-2 py-3 text-right font-bold">{inr(r.total_value)}</td>
                                            <td className="px-2 py-3 text-[10px] uppercase font-bold">{r.status}</td>
                                        </tr>
                                    ))}
                                    {!pendingLoading && pendingData?.rows.length === 0 && (
                                        <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">No pending POs found.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* ── Combined Export Dialog ───────────────────────────────────────── */}
            <Dialog open={exportOpen} onOpenChange={(o) => { if (!exporting) setExportOpen(o); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Download className="h-5 w-5 text-green-600" />
                            Export Reports to Excel
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-5 py-2">
                        <div className="space-y-3">
                            <Label className="text-sm font-semibold">Select report sections to export</Label>
                            <p className="text-xs text-muted-foreground">
                                Each selected section will appear as a separate sheet in one Excel file.
                            </p>
                            {SHEET_OPTIONS.map(({ id, label, desc }) => (
                                <div key={id} className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                                    <Checkbox
                                        id={`exp-${id}`}
                                        checked={exportSheets.includes(id)}
                                        onCheckedChange={(checked) => toggleSheet(id, checked === true)}
                                        className="mt-0.5"
                                    />
                                    <div className="space-y-0.5 leading-tight">
                                        <Label htmlFor={`exp-${id}`} className="cursor-pointer font-medium text-sm">{label}</Label>
                                        <p className="text-xs text-muted-foreground">{desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Date range <span className="font-normal text-muted-foreground">(optional — applies to Fulfillment &amp; Sales)</span></Label>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">From</Label>
                                    <Input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">To</Label>
                                    <Input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setExportOpen(false)} disabled={exporting}>Cancel</Button>
                        <Button
                            onClick={handleCombinedExport}
                            disabled={exportSheets.length === 0 || exporting}
                            className="bg-green-600 hover:bg-green-700 text-white"
                        >
                            {exporting
                                ? "Exporting…"
                                : `Export${exportSheets.length > 0 ? ` (${exportSheets.length} sheet${exportSheets.length > 1 ? "s" : ""})` : ""}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Combined Import Dialog ───────────────────────────────────────── */}
            <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setImportFile(null); setImportResult(null); } }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Upload className="h-5 w-5 text-blue-600" />
                            Import Combined Report Data
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <p className="text-sm text-muted-foreground">
                            Upload a combined report Excel file. Sheets are detected by name and imported automatically:
                        </p>
                        <ul className="text-xs text-muted-foreground space-y-1 pl-2 border-l-2 border-border">
                            <li><span className="font-medium text-foreground">"Fulfillment Report"</span> → Purchase Orders module</li>
                            <li><span className="font-medium text-foreground">"Pending POs"</span> → Purchase Orders module</li>
                            <li><span className="font-medium text-foreground">"Sales Report"</span> → Sales module</li>
                        </ul>

                        <div className="space-y-2">
                            <Label>Select file (.xlsx)</Label>
                            <div
                                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                                onClick={() => importFileRef.current?.click()}
                            >
                                {importFile ? (
                                    <div className="flex items-center justify-center gap-2 text-sm text-green-700">
                                        <FileText className="h-4 w-4" />
                                        <span className="font-medium">{importFile.name}</span>
                                        <span className="text-muted-foreground">({(importFile.size / 1024).toFixed(1)} KB)</span>
                                    </div>
                                ) : (
                                    <div className="text-muted-foreground text-sm">
                                        <UploadCloud className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                                        Click to choose or drop a file here
                                    </div>
                                )}
                            </div>
                            <input
                                ref={importFileRef}
                                type="file"
                                className="hidden"
                                accept=".xlsx"
                                onChange={(e) => { setImportFile(e.target.files[0] || null); setImportResult(null); }}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>If record already exists</Label>
                            <Select value={importConflict} onValueChange={setImportConflict}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="skip">Skip — keep existing record (safe)</SelectItem>
                                    <SelectItem value="update">Update — overwrite matching record</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {importResult && (
                            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm space-y-2">
                                <div className="font-semibold text-foreground">Import Results</div>
                                <div className="flex gap-4 flex-wrap text-xs">
                                    <span className="text-green-700">Total Created: <strong>{importResult.created}</strong></span>
                                    <span className="text-blue-700">Total Updated: <strong>{importResult.updated}</strong></span>
                                    <span className="text-orange-600">Total Skipped: <strong>{importResult.skipped}</strong></span>
                                </div>
                                {importResult.sheets && Object.entries(importResult.sheets).map(([sheetName, r]) => (
                                    <div key={sheetName} className="border-t border-border pt-2">
                                        <div className="font-medium text-xs text-muted-foreground mb-1">{sheetName}</div>
                                        <div className="flex gap-3 flex-wrap text-xs">
                                            <span className="text-green-700">Created: <strong>{r.created}</strong></span>
                                            <span className="text-blue-700">Updated: <strong>{r.updated}</strong></span>
                                            <span className="text-orange-600">Skipped: <strong>{r.skipped}</strong></span>
                                        </div>
                                    </div>
                                ))}
                                {importResult.errors?.length > 0 && (
                                    <div className="border-t border-border pt-2">
                                        <div className="text-destructive font-medium text-xs mb-1">Errors ({importResult.errors.length}):</div>
                                        <ul className="space-y-0.5 max-h-28 overflow-y-auto">
                                            {importResult.errors.map((e, i) => (
                                                <li key={i} className="text-destructive text-xs">• {e}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setImportOpen(false)}>Close</Button>
                        <Button
                            onClick={handleImport}
                            disabled={!importFile || importing}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {importing ? "Importing…" : "Import"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Reports;
