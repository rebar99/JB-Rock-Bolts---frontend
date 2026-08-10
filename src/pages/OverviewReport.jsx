import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchOverviewReport, openLogStream } from "@/lib/api";
import { round2 } from "@/lib/format";
import { fmtDateTimeDMY } from "@/lib/timezone";
import {
    ArrowLeft, Boxes, ChevronRight, ClipboardList, FileText, FolderKanban, Package, RefreshCw, Search, Users,
} from "lucide-react";
import { useSortableRows } from "@/hooks/useSortableRows";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import { useColumnFilters } from "@/hooks/useColumnFilters";
import { SortableHeader } from "@/components/SortableHeader";
import { FilterableHeader } from "@/components/FilterableHeader";
import { StickyScrollArea } from "@/components/StickyScrollArea";

const roundQty = round2;

// Mirrors the backend's normalize_project_name() so a row's raw project
// string (e.g. "2952KochiElevatedMetro") matches the deduped canonical name
// from client_projects (e.g. "2952 Kochi Elevated Metro Project Kochi")
// picked for that same project cluster.
const normalizeProjectNameJs = (name) => {
    if (!name) return "";
    return name.toUpperCase().replace(/[.,-]/g, "").replace(/\s+/g, "");
};

// Entity types whose create/edit/dispatch/delete activity should invalidate
// this dashboard — matches the entity_type strings the backend already logs
// via log_activity() for POs, WOs, and their Sale/dispatch records.
const RELEVANT_ENTITY_TYPES = new Set(["PurchaseOrder", "WorkOrder", "Sale", "WorkOrderSale"]);

// Falls back to a 45s poll + refetch-on-focus if the SSE push is ever missed
// (reconnect gap, etc.) — the endpoint itself has no caching, so every fetch
// is already a fresh calculation from the DB.
const POLL_INTERVAL_MS = 45_000;

const OVERVIEW_WIDTHS = {
    sno: 56, expand: 40, client_name: 260, ordered_qty: 150, dispatched_qty: 160, pending_qty: 150,
};

const ClientColumnAccessors = {
    client_name: (g) => g.client_name,
    ordered_qty: (g) => g.ordered_qty,
    dispatched_qty: (g) => g.dispatched_qty,
    pending_qty: (g) => g.pending_qty,
};

const applyColumnFilters = (rows, filters, accessors) => {
    const keys = Object.keys(filters);
    if (keys.length === 0) return rows;
    return rows.filter((r) =>
        keys.every((k) => {
            const v = accessors[k](r);
            return filters[k].has(v == null || v === "" ? "—" : String(v));
        })
    );
};

// Groups this client's rows straight into Product Type -> Dia/Pipe-Size
// buckets (e.g. every "16mm" Coupler line for this client, across however
// many of their POs/WOs mention it) — no intermediate PO/WO listing, just
// the dia-wise pending picture for that client.
const productBreakdownForClient = (clientRows) => {
    const productMap = new Map(); // product_type -> { ordered, dispatched }
    const sizeMap = new Map(); // `${product_type}::${size}` -> { size, size_label, ordered, dispatched }

    for (const r of clientRows) {
        const pt = productMap.get(r.product_type) || { ordered: 0, dispatched: 0 };
        pt.ordered += r.ordered_qty;
        pt.dispatched += r.dispatched_qty;
        productMap.set(r.product_type, pt);

        if (r.size) {
            const key = `${r.product_type}::${r.size}`;
            const s = sizeMap.get(key) || { product_type: r.product_type, size: r.size, size_label: r.size_label, ordered: 0, dispatched: 0 };
            s.ordered += r.ordered_qty;
            s.dispatched += r.dispatched_qty;
            sizeMap.set(key, s);
        }
    }

    return Array.from(productMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([product_type, totals]) => {
            const sizes = Array.from(sizeMap.values())
                .filter((s) => s.product_type === product_type)
                .map((s) => ({
                    size: s.size,
                    size_label: s.size_label,
                    ordered_qty: s.ordered,
                    dispatched_qty: s.dispatched,
                    pending_qty: Math.max(0, s.ordered - s.dispatched),
                }))
                .sort((a, b) => {
                    const na = parseFloat(a.size);
                    const nb = parseFloat(b.size);
                    return (Number.isNaN(na) ? 0 : na) - (Number.isNaN(nb) ? 0 : nb);
                });
            return {
                product_type,
                ordered_qty: totals.ordered,
                dispatched_qty: totals.dispatched,
                pending_qty: Math.max(0, totals.ordered - totals.dispatched),
                sizes,
            };
        });
};

const StatCard = ({ icon: Icon, label, value, accent }) => (
    <Card className="p-5 shadow-card hover:shadow-elegant transition-shadow border-border/60">
        <div className="flex items-start justify-between">
            <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="mt-2 text-2xl font-bold text-foreground tracking-tight">{value}</div>
            </div>
            <div className={`h-11 w-11 rounded-xl grid place-items-center ${accent ?? "bg-primary/10 text-primary"}`}>
                <Icon className="h-5 w-5" />
            </div>
        </div>
    </Card>
);

const OverviewReport = () => {
    const qc = useQueryClient();
    const [search, setSearch] = useState("");
    // "PO" or "WO" — Purchase Order rows and Work Order rows were always
    // fetched together (both live in the same overview endpoint/report),
    // but shown as two separate, independently switchable overviews rather
    // than blended into one client total that mixes both order types.
    const [overviewMode, setOverviewMode] = useState("PO");
    const [expandedClients, setExpandedClients] = useState(() => new Set());
    // client_key -> selected project name. Only relevant for clients with
    // 2+ projects on record — absent/undefined means "show the project
    // picker first" rather than lumping every project's pending qty together.
    const [selectedProjectByClient, setSelectedProjectByClient] = useState(() => new Map());

    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ["overviewReport"],
        queryFn: fetchOverviewReport,
        refetchInterval: POLL_INTERVAL_MS,
        refetchOnWindowFocus: true,
    });

    // Live push: any PO/WO/Sale/dispatch create-edit-delete anywhere in the
    // app broadcasts over the same SSE bus the activity bell already uses —
    // subscribing here (no user param, so it doesn't touch online-presence
    // tracking) lets this dashboard refresh the moment it happens instead of
    // waiting for the next poll.
    useEffect(() => {
        const es = openLogStream((log) => {
            if (RELEVANT_ENTITY_TYPES.has(log.entity_type)) {
                qc.invalidateQueries({ queryKey: ["overviewReport"] });
            }
        });
        return () => es.close();
    }, [qc]);

    const toggleClient = (clientKey) => {
        setExpandedClients((prev) => {
            const next = new Set(prev);
            if (next.has(clientKey)) {
                next.delete(clientKey);
                // Collapsing resets the project pick too, so reopening this
                // client always starts back at the project list rather than
                // silently reusing whatever was picked last time.
                setSelectedProjectByClient((prevSel) => {
                    if (!prevSel.has(clientKey)) return prevSel;
                    const nextSel = new Map(prevSel);
                    nextSel.delete(clientKey);
                    return nextSel;
                });
            } else {
                next.add(clientKey);
            }
            return next;
        });
    };

    const selectProject = (clientKey, projectName) => {
        setSelectedProjectByClient((prev) => new Map(prev).set(clientKey, projectName));
    };

    const backToProjects = (clientKey) => {
        setSelectedProjectByClient((prev) => {
            const next = new Map(prev);
            next.delete(clientKey);
            return next;
        });
    };

    const allRows = data?.rows ?? [];
    // Scoped to the active PO/WO overview — client_projects is split by
    // source server-side so a client's PO-only projects never leak into
    // the Work Order Overview's project picker, and vice versa.
    const clientProjects = data?.client_projects?.[overviewMode] ?? {};

    const modeRows = useMemo(() => allRows.filter((r) => r.source === overviewMode), [allRows, overviewMode]);

    const searchedRows = useMemo(() => {
        const s = search.trim().toLowerCase();
        if (!s) return modeRows;
        return modeRows.filter((r) =>
            (r.order_no || "").toLowerCase().includes(s) ||
            (r.client_name || "").toLowerCase().includes(s) ||
            (r.product_type || "").toLowerCase().includes(s) ||
            (r.item || "").toLowerCase().includes(s)
        );
    }, [modeRows, search]);

    // One row per client — this is the whole point of the grouping: 20
    // clients in the data means 20 rows here, each carrying that client's
    // own totals, with their dia-wise pending breakdown available on
    // Expand. Grouped by client_key (server-side normalized — same logic
    // behind the "Total Clients" card) rather than the raw client_name
    // string, so minor typing differences ("M/s. Xyz" vs "M/s Xyz")
    // collapse into one row instead of splitting the same client across
    // several.
    const clientGroups = useMemo(() => {
        const map = new Map();
        for (const r of searchedRows) {
            let g = map.get(r.client_key);
            if (!g) {
                g = { client_key: r.client_key, client_name: r.client_name, ordered_qty: 0, dispatched_qty: 0, pending_qty: 0, rows: [] };
                map.set(r.client_key, g);
            }
            g.ordered_qty += r.ordered_qty;
            g.dispatched_qty += r.dispatched_qty;
            g.pending_qty += r.pending_qty;
            g.rows.push(r);
        }
        return Array.from(map.values());
    }, [searchedRows]);

    const { filters, setFilter } = useColumnFilters();
    const filteredGroups = applyColumnFilters(clientGroups, filters, ClientColumnAccessors);
    const { widths, startResize } = useResizableColumns("colw:overview", OVERVIEW_WIDTHS);
    const { sortedRows: sortedGroups, sortConfig, setSort } = useSortableRows(filteredGroups);

    // Summary cards are scoped to the selected overview (PO-only or
    // WO-only) rather than the server's combined totals, which cover both
    // — otherwise "Total Ordered Qty" on the PO Overview would silently
    // include Work Order quantities too.
    const modeSummary = useMemo(() => {
        const clientKeys = new Set();
        let ordered = 0, dispatched = 0, pending = 0;
        for (const r of modeRows) {
            ordered += r.ordered_qty;
            dispatched += r.dispatched_qty;
            pending += r.pending_qty;
            clientKeys.add(r.client_key);
        }
        return { total_ordered_qty: ordered, total_dispatched_qty: dispatched, total_pending_qty: pending, total_clients: clientKeys.size };
    }, [modeRows]);

    return (
        <div className="space-y-6">
            {/* ── As on Updated ─────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                    As on Updated: <span className="font-semibold text-foreground">{data ? fmtDateTimeDMY(data.generated_at) : "—"}</span>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isFetching}
                >
                    <RefreshCw className={`h-3.5 w-3.5 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Refresh
                </Button>
            </div>

            {/* ── Purchase Order / Work Order overview switch ─────────────────── */}
            <Tabs
                value={overviewMode}
                onValueChange={(mode) => {
                    setOverviewMode(mode);
                    setExpandedClients(new Set());
                    setSelectedProjectByClient(new Map());
                }}
                className="w-full"
            >
                <TabsList className="grid w-full grid-cols-2 mb-2 p-1 bg-muted/50 rounded-xl">
                    <TabsTrigger value="PO" className="rounded-lg py-2 transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">
                        <FileText className="h-4 w-4 mr-2" /> Purchase Order Overview
                    </TabsTrigger>
                    <TabsTrigger value="WO" className="rounded-lg py-2 transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">
                        <ClipboardList className="h-4 w-4 mr-2" /> Work Order Overview
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            {/* ── Summary cards ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Package} label="Total Ordered Qty" value={roundQty(modeSummary.total_ordered_qty)} accent="bg-primary/10 text-primary" />
                <StatCard icon={Boxes} label="Total Dispatched Qty" value={roundQty(modeSummary.total_dispatched_qty)} accent="bg-success/15 text-success" />
                <StatCard icon={ClipboardList} label="Total Pending Qty" value={roundQty(modeSummary.total_pending_qty)} accent="bg-warning/15 text-warning" />
                <StatCard icon={Users} label="Total Clients" value={String(modeSummary.total_clients)} accent="bg-steel/15 text-steel" />
            </div>

            {/* ── Search ─────────────────────────────────────────────────────── */}
            <Card className="p-4 shadow-card">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by client, item, product type, PO/WO number..."
                        className="pl-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </Card>

            {/* ── Main table — one row per client ───────────────────────────── */}
            <Card className="shadow-card">
                <StickyScrollArea>
                    <table className="w-full text-sm table-fixed">
                        <thead className="bg-muted/50 text-foreground text-sm font-bold uppercase tracking-wider">
                            <tr>
                                <SortableHeader label="S.No." width={widths.sno} onResizeStart={startResize("sno")} />
                                <SortableHeader label="" width={widths.expand} onResizeStart={startResize("expand")} />
                                <FilterableHeader label="Client Name" columnKey="client_name" accessor={ClientColumnAccessors.client_name} sortConfig={sortConfig} setSort={setSort} width={widths.client_name} onResizeStart={startResize("client_name")} rows={clientGroups} filterValue={filters.client_name} onApplyFilter={setFilter} />
                                <FilterableHeader label="Total Ordered Qty" columnKey="ordered_qty" type="number" align="right" accessor={ClientColumnAccessors.ordered_qty} sortConfig={sortConfig} setSort={setSort} width={widths.ordered_qty} onResizeStart={startResize("ordered_qty")} rows={clientGroups} filterValue={filters.ordered_qty} onApplyFilter={setFilter} />
                                <FilterableHeader label="Total Dispatched Qty" columnKey="dispatched_qty" type="number" align="right" accessor={ClientColumnAccessors.dispatched_qty} sortConfig={sortConfig} setSort={setSort} width={widths.dispatched_qty} onResizeStart={startResize("dispatched_qty")} rows={clientGroups} filterValue={filters.dispatched_qty} onApplyFilter={setFilter} />
                                <FilterableHeader label="Total Pending Qty" columnKey="pending_qty" type="number" align="right" accessor={ClientColumnAccessors.pending_qty} sortConfig={sortConfig} setSort={setSort} width={widths.pending_qty} onResizeStart={startResize("pending_qty")} rows={clientGroups} filterValue={filters.pending_qty} onApplyFilter={setFilter} />
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>}
                            {!isLoading && sortedGroups.map((g, idx) => {
                                const isExpanded = expandedClients.has(g.client_key);
                                const projects = clientProjects[g.client_key] || [];
                                const selectedProject = selectedProjectByClient.get(g.client_key) || null;
                                // Only worth asking "which project?" when there
                                // are actually 2+ on record — a single-project
                                // (or no-project) client goes straight to its
                                // dia-wise breakdown like before.
                                const showProjectPicker = isExpanded && projects.length >= 2 && !selectedProject;
                                const breakdownRows = selectedProject
                                    ? g.rows.filter((r) => normalizeProjectNameJs(r.project) === normalizeProjectNameJs(selectedProject))
                                    : g.rows;
                                const products = isExpanded && !showProjectPicker ? productBreakdownForClient(breakdownRows) : [];
                                return (
                                    <Fragment key={g.client_key}>
                                        <tr className={`border-t border-border transition-colors text-[12.5px] ${isExpanded ? "bg-slate-900 dark:bg-white [&>td]:!text-white dark:[&>td]:!text-slate-900" : "hover:bg-muted/30"}`}>
                                            <td className="px-2 py-3 text-center text-muted-foreground">{idx + 1}</td>
                                            <td className="px-2 py-3 text-center">
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-muted"
                                                    onClick={() => toggleClient(g.client_key)}
                                                    aria-label={isExpanded ? "Collapse" : "Expand"}
                                                >
                                                    <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                                </button>
                                            </td>
                                            <td
                                                className="px-2 py-3 text-center font-semibold truncate cursor-pointer hover:underline"
                                                title={g.client_name}
                                                onClick={() => toggleClient(g.client_key)}
                                            >
                                                {g.client_name}
                                            </td>
                                            <td className="px-2 py-3 text-center font-medium whitespace-nowrap">{roundQty(g.ordered_qty)}</td>
                                            <td className="px-2 py-3 text-center font-bold text-success whitespace-nowrap">{roundQty(g.dispatched_qty)}</td>
                                            <td className="px-2 py-3 text-center font-bold text-warning whitespace-nowrap">{roundQty(g.pending_qty)}</td>
                                        </tr>
                                        {isExpanded && showProjectPicker && (
                                            <tr className="border-t border-border bg-muted/20">
                                                <td></td>
                                                <td></td>
                                                <td colSpan={4} className="px-4 py-3">
                                                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                                                        {g.client_name} — Select a Project
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                                        {projects.map((proj) => (
                                                            <button
                                                                key={proj}
                                                                type="button"
                                                                onClick={() => selectProject(g.client_key, proj)}
                                                                className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-left text-sm font-medium text-foreground hover:border-primary hover:bg-primary/5 transition-colors"
                                                            >
                                                                <FolderKanban className="h-4 w-4 text-primary shrink-0" />
                                                                <span className="truncate" title={proj}>{proj}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        {isExpanded && !showProjectPicker && (
                                            <tr className="border-t border-border bg-muted/20">
                                                <td></td>
                                                <td></td>
                                                <td colSpan={4} className="px-4 py-3">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        {projects.length >= 2 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => backToProjects(g.client_key)}
                                                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
                                                            >
                                                                <ArrowLeft className="h-3.5 w-3.5" /> Projects
                                                            </button>
                                                        )}
                                                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
                                                            {g.client_name}{selectedProject ? ` — ${selectedProject}` : ""} — Dia-wise Pending Summary
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                                        {products.map((p) => (
                                                            <div key={p.product_type} className="rounded-lg border border-border bg-card p-3">
                                                                <div className="flex items-center justify-between mb-2 gap-2">
                                                                    <div className="font-semibold text-sm text-foreground truncate">{p.product_type}</div>
                                                                    <div className="text-xs font-bold text-warning whitespace-nowrap">{roundQty(p.pending_qty)} pending</div>
                                                                </div>
                                                                {p.sizes.length === 0 ? (
                                                                    <div className="text-xs text-muted-foreground">
                                                                        No size detail found in item name — Ordered {roundQty(p.ordered_qty)}, Dispatched {roundQty(p.dispatched_qty)}, Pending {roundQty(p.pending_qty)}
                                                                    </div>
                                                                ) : (
                                                                    <table className="w-full text-xs">
                                                                        <thead>
                                                                            <tr className="text-muted-foreground uppercase text-[10px]">
                                                                                <th className="text-left py-1 pr-2">{p.sizes[0].size_label}</th>
                                                                                <th className="text-right py-1 pr-2">Ordered</th>
                                                                                <th className="text-right py-1 pr-2">Dispatched</th>
                                                                                <th className="text-right py-1">Pending</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {p.sizes.map((s) => (
                                                                                <tr key={s.size} className="border-t border-border/60">
                                                                                    <td className="py-1 pr-2 font-medium">{s.size}</td>
                                                                                    <td className="py-1 pr-2 text-right">{roundQty(s.ordered_qty)}</td>
                                                                                    <td className="py-1 pr-2 text-right text-success">{roundQty(s.dispatched_qty)}</td>
                                                                                    <td className="py-1 text-right font-semibold text-warning">{roundQty(s.pending_qty)}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                            {!isLoading && sortedGroups.length === 0 && (
                                <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">No purchase or work orders found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </StickyScrollArea>
            </Card>
        </div>
    );
};

export default OverviewReport;
