import { useState, useMemo, useRef, useEffect } from "react";
import { ArrowUpDown, ArrowUpAZ, ArrowDownAZ, FilterX, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ColumnFilterDropdown({
    label,
    colKey,
    allValues = [],
    activeFilters = {},
    setActiveFilters,
    sortKey,
    sortDir,
    onSort,
    align = "left",
    className = "",
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return allValues.filter((v) => String(v ?? "").toLowerCase().includes(q));
    }, [allValues, search]);

    const selectedSet = activeFilters[colKey] || null; // null = all selected
    const allSelected = !selectedSet;

    const toggle = (val) => {
        setActiveFilters((prev) => {
            const cur = prev[colKey] ? new Set(prev[colKey]) : new Set(allValues);
            if (cur.has(val)) cur.delete(val);
            else cur.add(val);
            if (cur.size === allValues.length) return { ...prev, [colKey]: null };
            return { ...prev, [colKey]: [...cur] };
        });
    };

    const toggleAll = () => {
        setActiveFilters((prev) => ({ ...prev, [colKey]: null }));
    };

    const clearFilter = () => {
        setActiveFilters((prev) => ({ ...prev, [colKey]: null }));
        setOpen(false);
    };

    const isFiltered = !!selectedSet;
    const isSorted = sortKey === colKey;

    const alignBtnClass =
        align === "right"
            ? "justify-end text-right"
            : align === "center"
            ? "justify-center text-center"
            : "justify-between text-left";
    const dropdownAlignClass =
        align === "right" || ["salary", "status", "salary_calc", "net_salary"].includes(colKey)
            ? "right-0"
            : "left-0";

    return (
        <div ref={ref} className={cn("relative w-full inline-block", className)} onClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    "flex items-center gap-1.5 w-full font-bold uppercase tracking-wider text-[10px] sm:text-[11px] group/hbtn select-none hover:text-blue-700 dark:hover:text-blue-400 transition-colors",
                    alignBtnClass,
                    isFiltered || isSorted ? "text-blue-600 dark:text-blue-400 font-extrabold" : "text-slate-800 dark:text-slate-100"
                )}
                title={`Filter / Sort ${label}`}
            >
                <span className="truncate">{label}</span>
                <span
                    className={cn(
                        "inline-flex items-center justify-center rounded p-0.5 transition-colors shrink-0",
                        isFiltered || isSorted
                            ? "bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300"
                            : "text-slate-400 group-hover/hbtn:text-slate-700"
                    )}
                >
                    {isSorted ? (
                        sortDir === "asc" ? (
                            <ArrowUpAZ className="h-3.5 w-3.5" />
                        ) : (
                            <ArrowDownAZ className="h-3.5 w-3.5" />
                        )
                    ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-60 group-hover/hbtn:opacity-100" />
                    )}
                </span>
            </button>

            {open && (
                <div
                    className={cn(
                        "absolute top-full mt-1.5 z-[999] w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl text-xs overflow-hidden normal-case font-normal text-slate-700 dark:text-slate-200 animate-in fade-in zoom-in-95 duration-100",
                        dropdownAlignClass
                    )}
                >
                    {/* Sort buttons */}
                    <div className="py-1">
                        <button
                            type="button"
                            onClick={() => {
                                onSort(colKey, "asc");
                                setOpen(false);
                            }}
                            className={cn(
                                "flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors",
                                isSorted && sortDir === "asc"
                                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-medium"
                                    : ""
                            )}
                        >
                            <ArrowUpAZ className="h-4 w-4 text-slate-500" />
                            <span>Sort A to Z</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                onSort(colKey, "desc");
                                setOpen(false);
                            }}
                            className={cn(
                                "flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors",
                                isSorted && sortDir === "desc"
                                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-medium"
                                    : ""
                            )}
                        >
                            <ArrowDownAZ className="h-4 w-4 text-slate-500" />
                            <span>Sort Z to A</span>
                        </button>
                    </div>

                    <div className="border-t border-slate-200 dark:border-slate-800" />

                    {/* Clear filter */}
                    <div className="py-1">
                        <button
                            type="button"
                            disabled={!isFiltered}
                            onClick={clearFilter}
                            className={cn(
                                "flex items-center gap-2.5 w-full px-3 py-1.5 text-left transition-colors",
                                isFiltered
                                    ? "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
                                    : "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                            )}
                        >
                            <FilterX className="h-3.5 w-3.5" />
                            <span className="truncate">Clear Filter from "{label}"</span>
                        </button>
                    </div>

                    <div className="border-t border-slate-200 dark:border-slate-800" />

                    {/* Search box */}
                    <div className="p-2 bg-slate-50/50 dark:bg-slate-800/40">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                            <input
                                autoFocus
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search..."
                                className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-2 py-1 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                            />
                        </div>
                    </div>

                    {/* Value list with checkboxes */}
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-1">
                        <label className="flex items-center gap-2.5 px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer font-semibold text-slate-900 dark:text-slate-100">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={toggleAll}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-0 cursor-pointer"
                            />
                            <span>(Select All)</span>
                        </label>
                        {filtered.length === 0 ? (
                            <div className="px-3 py-2 text-center text-xs text-slate-400">No matches found</div>
                        ) : (
                            filtered.map((val) => {
                                const checked = allSelected || (selectedSet && selectedSet.includes(val));
                                return (
                                    <label
                                        key={val}
                                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-slate-700 dark:text-slate-300"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={!!checked}
                                            onChange={() => toggle(val)}
                                            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-0 cursor-pointer"
                                        />
                                        <span className="truncate">{val || "(Blank)"}</span>
                                    </label>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
