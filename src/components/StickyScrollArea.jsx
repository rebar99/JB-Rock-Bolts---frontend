import { useCallback, useEffect, useRef, useState } from "react";

// Wraps a horizontally-scrollable table with a custom-drawn scrollbar track
// + thumb, pinned to the bottom of the viewport (via `position: sticky`), so
// users can scroll left/right without having to scroll all the way down to
// the table's bottom edge first — and without depending on the browser/OS's
// native scrollbar rendering (which on many setups is an invisible overlay
// that only appears while actively scrolling/hovering).
export const StickyScrollArea = ({ children, className = "" }) => {
    const contentRef = useRef(null);
    const trackRef = useRef(null);
    const [metrics, setMetrics] = useState({ scrollWidth: 0, clientWidth: 0, scrollLeft: 0 });
    const dragRef = useRef(null);

    const readMetrics = useCallback(() => {
        const el = contentRef.current;
        if (!el) return;
        setMetrics({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollLeft: el.scrollLeft });
    }, []);

    useEffect(() => {
        const content = contentRef.current;
        if (!content) return;
        readMetrics();

        const ro = new ResizeObserver(readMetrics);
        ro.observe(content);
        const table = content.querySelector("table");
        if (table) ro.observe(table);

        content.addEventListener("scroll", readMetrics, { passive: true });
        return () => {
            ro.disconnect();
            content.removeEventListener("scroll", readMetrics);
        };
    }, [children, readMetrics]);

    const hasOverflow = metrics.scrollWidth > metrics.clientWidth + 1;
    const thumbWidthPct = hasOverflow ? Math.max((metrics.clientWidth / metrics.scrollWidth) * 100, 4) : 100;
    const maxScrollLeft = Math.max(metrics.scrollWidth - metrics.clientWidth, 1);
    const thumbLeftPct = hasOverflow ? (metrics.scrollLeft / maxScrollLeft) * (100 - thumbWidthPct) : 0;

    const scrollByRatio = (clientX) => {
        const track = trackRef.current;
        const content = contentRef.current;
        if (!track || !content) return;
        const rect = track.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        content.scrollLeft = ratio * maxScrollLeft;
    };

    const onThumbMouseDown = (e) => {
        e.preventDefault();
        dragRef.current = { startX: e.clientX, startScrollLeft: contentRef.current.scrollLeft };

        const onMove = (moveEvent) => {
            const track = trackRef.current;
            const content = contentRef.current;
            if (!track || !content || !dragRef.current) return;
            const trackWidth = track.getBoundingClientRect().width;
            const deltaX = moveEvent.clientX - dragRef.current.startX;
            const deltaScroll = (deltaX / trackWidth) * metrics.scrollWidth;
            content.scrollLeft = dragRef.current.startScrollLeft + deltaScroll;
        };
        const onUp = () => {
            dragRef.current = null;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    };

    const onTrackClick = (e) => {
        if (e.target === trackRef.current) scrollByRatio(e.clientX);
    };

    return (
        <div className={className}>
            <div ref={contentRef} className="overflow-x-auto scrollbar-hide">
                {children}
            </div>
            {hasOverflow && (
                <div
                    ref={trackRef}
                    onMouseDown={onTrackClick}
                    className="sticky bottom-0 z-10 h-3.5 bg-muted/70 border-t border-border cursor-pointer"
                >
                    <div
                        onMouseDown={onThumbMouseDown}
                        className="h-full rounded-full bg-primary/50 hover:bg-primary/70 active:bg-primary/80 cursor-grab active:cursor-grabbing transition-colors"
                        style={{ width: `${thumbWidthPct}%`, marginLeft: `${thumbLeftPct}%` }}
                    />
                </div>
            )}
        </div>
    );
};
