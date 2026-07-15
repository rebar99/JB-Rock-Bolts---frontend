import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Drop-in replacement for a raw <th>. When `columnKey`+`onSort` are given the
// label becomes a clickable sort toggle with an icon reflecting the current
// direction; every column (sortable or not) gets a drag handle on its right
// edge wired to `onResizeStart` so all columns stay resizable.
export const SortableHeader = ({
    label,
    columnKey,
    align = "left",
    sortConfig,
    onSort,
    accessor,
    type = "string",
    width,
    onResizeStart,
    className,
}) => {
    const isSortable = !!(columnKey && onSort);
    const isActive = isSortable && sortConfig?.key === columnKey;
    const direction = isActive ? sortConfig.direction : null;
    const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;

    return (
        <th
            style={width ? { width, minWidth: width, maxWidth: width } : undefined}
            className={cn("relative select-none overflow-hidden text-center", className)}
        >
            {isSortable ? (
                <button
                    type="button"
                    onClick={() => onSort(columnKey, accessor, type)}
                    className={cn(
                        "inline-flex items-center justify-center gap-1 max-w-full min-w-0 mx-auto hover:text-foreground transition-colors",
                        isActive && "text-foreground"
                    )}
                >
                    <span className="truncate">{label}</span>
                    <Icon className={cn("h-3 w-3 shrink-0", isActive ? "opacity-100" : "opacity-40")} />
                </button>
            ) : (
                <span className="truncate">{label}</span>
            )}
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
