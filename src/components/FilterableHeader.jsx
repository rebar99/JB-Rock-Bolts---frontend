import { useMemo, useState } from "react";
import { ArrowUpAZ, ArrowDownAZ, ChevronDown, FilterX, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EMPTY = "—";

// Excel-style AutoFilter header: a small dropdown arrow opens a menu with
// Sort A-Z / Sort Z-A, a "Clear Filter" action (when active), a search box,
// and a checkbox checklist of every distinct value in the column — exactly
// the "Select All" + per-value checklist pattern from Excel's column filter.
export const FilterableHeader = ({
    label,
    columnKey,
    align = "left",
    width,
    onResizeStart,
    sortConfig,
    setSort,
    accessor,
    type = "string",
    rows,
    filterValue,
    onApplyFilter,
    className,
}) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [pending, setPending] = useState(null);

    const get = accessor || ((row) => row[columnKey]);

    const uniqueValues = useMemo(() => {
        const set = new Set();
        rows.forEach((r) => {
            const v = get(r);
            set.add(v == null || v === "" ? EMPTY : String(v));
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, columnKey]);

    const isActive = !!filterValue;
    const direction = sortConfig?.key === columnKey ? sortConfig.direction : null;

    const openMenu = () => {
        setPending(new Set(filterValue || uniqueValues));
        setSearch("");
        setOpen(true);
    };

    const toggleValue = (val) => {
        setPending((prev) => {
            const next = new Set(prev);
            if (next.has(val)) next.delete(val); else next.add(val);
            return next;
        });
    };

    const visibleValues = uniqueValues.filter((v) => v.toLowerCase().includes(search.toLowerCase()));
    const allChecked = !!pending && visibleValues.length > 0 && visibleValues.every((v) => pending.has(v));
    const toggleAllVisible = (checked) => {
        setPending((prev) => {
            const next = new Set(prev);
            visibleValues.forEach((v) => { if (checked) next.add(v); else next.delete(v); });
            return next;
        });
    };

    const applyAndClose = () => {
        onApplyFilter(columnKey, pending.size === uniqueValues.length ? null : new Set(pending));
        setOpen(false);
    };

    return (
        <th
            style={width ? { width, minWidth: width, maxWidth: width } : undefined}
            className={cn("relative select-none overflow-hidden text-center", className)}
        >
            <div className="flex items-center justify-center gap-1">
                <span className="truncate">{label}</span>
                <Popover open={open} onOpenChange={(o) => (o ? openMenu() : setOpen(false))}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className={cn("shrink-0 rounded hover:bg-muted p-0.5", isActive && "text-primary bg-primary/10")}
                            title="Sort & Filter"
                        >
                            <ChevronDown className="h-3 w-3" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0 text-foreground" align="start">
                        <div className="p-1">
                            <button
                                onClick={() => { setSort(columnKey, "asc", accessor, type); setOpen(false); }}
                                className={cn("w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left", direction === "asc" && "text-primary font-medium")}
                            >
                                <ArrowUpAZ className="h-3.5 w-3.5" /> Sort A to Z
                            </button>
                            <button
                                onClick={() => { setSort(columnKey, "desc", accessor, type); setOpen(false); }}
                                className={cn("w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left", direction === "desc" && "text-primary font-medium")}
                            >
                                <ArrowDownAZ className="h-3.5 w-3.5" /> Sort Z to A
                            </button>
                        </div>
                        <div className="border-t border-border" />
                        <div className="p-1">
                            <button
                                onClick={() => { onApplyFilter(columnKey, null); setOpen(false); }}
                                disabled={!isActive}
                                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            >
                                <FilterX className="h-3.5 w-3.5" /> Clear Filter from "{label}"
                            </button>
                        </div>
                        <div className="border-t border-border" />
                        <div className="p-2 space-y-2">
                            <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search..."
                                    className="h-7 pl-7 text-xs"
                                />
                            </div>
                            <div className="max-h-48 overflow-y-auto border border-border rounded-md">
                                <label className="flex items-center gap-2 px-2 py-1 text-xs border-b border-border/50 hover:bg-muted/50 cursor-pointer sticky top-0 bg-popover">
                                    <Checkbox checked={allChecked} onCheckedChange={toggleAllVisible} />
                                    <span className="font-medium">(Select All)</span>
                                </label>
                                {visibleValues.map((v) => (
                                    <label key={v} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted/50 cursor-pointer">
                                        <Checkbox checked={pending?.has(v) ?? false} onCheckedChange={() => toggleValue(v)} />
                                        <span className="truncate">{v}</span>
                                    </label>
                                ))}
                                {visibleValues.length === 0 && (
                                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">No matches</div>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 p-2 border-t border-border">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button size="sm" className="h-7 text-xs" onClick={applyAndClose}>OK</Button>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
            {onResizeStart && (
                <div
                    onMouseDown={onResizeStart}
                    className="group absolute right-0 top-0 h-full w-2.5 cursor-col-resize hover:bg-primary/20 active:bg-primary/40 z-10 flex justify-center"
                    title="Drag to resize column"
                >
                    <div className="w-[3px] h-full bg-border group-hover:bg-primary group-active:bg-primary rounded-full transition-colors" />
                </div>
            )}
        </th>
    );
};
