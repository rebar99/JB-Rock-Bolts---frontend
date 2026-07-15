import { useCallback, useRef, useState } from "react";

const MIN_ROW_HEIGHT = 28;
const MAX_ROW_HEIGHT = 200;

const loadHeights = (storageKey) => {
    try {
        return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
        return {};
    }
};

// Per-row height map, keyed by row id, backed by localStorage — the
// row-height equivalent of useResizableColumns. `getHeight(rowId)` falls
// back to `defaultHeight` for any row that hasn't been manually resized.
export function useResizableRows(storageKey, defaultHeight = 44) {
    const [heights, setHeights] = useState(() => loadHeights(storageKey));
    const dragRef = useRef(null);

    const getHeight = useCallback((rowId) => heights[rowId] ?? defaultHeight, [heights, defaultHeight]);

    const startResize = useCallback((rowId) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startY = e.clientY;
        const startHeight = heights[rowId] ?? defaultHeight;
        dragRef.current = { rowId, startY, startHeight };

        const onMouseMove = (moveEvent) => {
            if (!dragRef.current) return;
            const delta = moveEvent.clientY - dragRef.current.startY;
            const next = Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, dragRef.current.startHeight + delta));
            setHeights((h) => ({ ...h, [dragRef.current.rowId]: next }));
        };

        const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            dragRef.current = null;
            setHeights((h) => {
                try { localStorage.setItem(storageKey, JSON.stringify(h)); } catch { /* storage unavailable */ }
                return h;
            });
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }, [storageKey, heights, defaultHeight]);

    return { getHeight, startResize };
}
