import { useMemo, useState, useCallback } from "react";

// Cycles asc -> desc -> none per column. When direction is null, `sortedRows`
// is the exact same array reference passed in, so "no sort" always reproduces
// the original fetch/import order (never a copy, never re-ordered).
export function useSortableRows(rows, defaultSort = null) {
    const [sortConfig, setSortConfig] = useState(defaultSort);

    const requestSort = useCallback((key, accessor, type = "string") => {
        setSortConfig((prev) => {
            if (!prev || prev.key !== key) return { key, direction: "asc", accessor, type };
            if (prev.direction === "asc") return { key, direction: "desc", accessor, type };
            return null;
        });
    }, []);

    // Direct set (vs. requestSort's asc->desc->none cycle) — used by menus that
    // offer explicit "Sort A to Z" / "Sort Z to A" actions rather than a single
    // toggle button.
    const setSort = useCallback((key, direction, accessor, type = "string") => {
        setSortConfig(direction ? { key, direction, accessor, type } : null);
    }, []);

    const sortedRows = useMemo(() => {
        if (!sortConfig || !sortConfig.direction) return rows;
        const { direction, accessor, type } = sortConfig;
        const get = accessor || ((row) => row[sortConfig.key]);
        const dir = direction === "asc" ? 1 : -1;

        const compare = (a, b) => {
            const av = get(a);
            const bv = get(b);
            if (av == null && bv == null) return 0;
            if (av == null) return -1 * dir;
            if (bv == null) return 1 * dir;

            if (type === "number") {
                return (Number(av) - Number(bv)) * dir;
            }
            if (type === "date") {
                return (new Date(av).getTime() - new Date(bv).getTime()) * dir;
            }
            return String(av).localeCompare(String(bv), undefined, { sensitivity: "base", numeric: true }) * dir;
        };

        return [...rows].sort(compare);
    }, [rows, sortConfig]);

    return { sortedRows, sortConfig, requestSort, setSort };
}
