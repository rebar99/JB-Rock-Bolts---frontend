import { useMemo, useState, useCallback } from "react";

// Parses a date value for chronological comparison.
// Handles DD-MM-YYYY strings (the format the API returns for invoice dates)
// by reordering to YYYY-MM-DD before constructing a JS Date.
// Falls back to native Date parsing for ISO strings and other formats.
// Returns null for empty/invalid values so they sort to the end.
function parseDateValue(v) {
    if (v == null || v === "" || v === "—") return null;
    const s = String(v).trim();
    // DD-MM-YYYY  →  YYYY-MM-DD
    const dmyMatch = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (dmyMatch) {
        const [, dd, mm, yyyy] = dmyMatch;
        const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

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
                const da = parseDateValue(av);
                const db = parseDateValue(bv);
                // Null/invalid dates always sort to the end regardless of direction.
                if (da === null && db === null) return 0;
                if (da === null) return 1;
                if (db === null) return -1;
                return (da.getTime() - db.getTime()) * dir;
            }
            return String(av).localeCompare(String(bv), undefined, { sensitivity: "base", numeric: true }) * dir;
        };

        return [...rows].sort(compare);
    }, [rows, sortConfig]);

    return { sortedRows, sortConfig, requestSort, setSort };
}
