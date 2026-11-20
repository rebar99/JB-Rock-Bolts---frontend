import { useCallback, useRef, useState } from "react";

const MIN_COL_WIDTH = 50;
const MAX_COL_WIDTH = 600;

const loadWidths = (storageKey, defaultWidths) => {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
        return { ...defaultWidths, ...saved };
    } catch {
        return { ...defaultWidths };
    }
};

// Column widths persist per-table in localStorage (keyed by storageKey), so a
// drag survives a page refresh. Widths are only written back on mouseup, not
// on every pixel of movement, to avoid thrashing storage while dragging.
export function useResizableColumns(storageKey, defaultWidths, options = {}) {
    const [widths, setWidths] = useState(() => loadWidths(storageKey, defaultWidths));
    const dragRef = useRef(null);

    const startResize = useCallback((columnKey, colMin, colMax) => (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = widths[columnKey] ?? defaultWidths[columnKey] ?? 120;
        const minW = colMin ?? options.minWidth ?? MIN_COL_WIDTH;
        const maxW = colMax ?? options.maxWidth ?? MAX_COL_WIDTH;
        dragRef.current = { columnKey, startX, startWidth, minW, maxW };

        const onMouseMove = (moveEvent) => {
            if (!dragRef.current) return;
            const { columnKey, startX, startWidth, minW, maxW } = dragRef.current;
            const delta = moveEvent.clientX - startX;
            const next = Math.min(maxW, Math.max(minW, startWidth + delta));
            setWidths((w) => ({ ...w, [columnKey]: next }));
        };

        const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            dragRef.current = null;
            setWidths((w) => {
                try { localStorage.setItem(storageKey, JSON.stringify(w)); } catch { /* storage unavailable */ }
                return w;
            });
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }, [storageKey, widths, defaultWidths]);

    const resetWidths = useCallback(() => {
        setWidths({ ...defaultWidths });
        try { localStorage.removeItem(storageKey); } catch { /* storage unavailable */ }
    }, [storageKey, defaultWidths]);

    return { widths, startResize, resetWidths };
}
