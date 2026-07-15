import { useCallback, useState } from "react";

// Tracks which columns have an active "checklist" filter (Excel AutoFilter
// style: a column is filtered to a specific Set of allowed values, or not
// filtered at all — never an empty Set, since the caller normalizes
// "everything selected" back to "no filter" before calling setFilter).
export function useColumnFilters() {
    const [filters, setFilters] = useState({});

    const setFilter = useCallback((key, values) => {
        setFilters((f) => {
            if (values === null) {
                if (!(key in f)) return f;
                const next = { ...f };
                delete next[key];
                return next;
            }
            return { ...f, [key]: values };
        });
    }, []);

    const clearFilter = useCallback((key) => setFilter(key, null), [setFilter]);
    const clearAllFilters = useCallback(() => setFilters({}), []);
    const isFilterActive = useCallback((key) => key in filters, [filters]);

    return { filters, setFilter, clearFilter, clearAllFilters, isFilterActive };
}
