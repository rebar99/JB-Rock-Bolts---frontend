import { cn } from "@/lib/utils";

const map = {
    Paid: "bg-success/15 text-success border-success/30",
    Delivered: "bg-success/15 text-success border-success/30",
    InStock: "bg-success/15 text-success border-success/30",
    Pending: "bg-warning/15 text-warning border-warning/30",
    "Not Delivered": "bg-destructive/15 text-destructive border-destructive/30",
    Low: "bg-warning/15 text-warning border-warning/30",
    Partial: "bg-primary/10 text-primary border-primary/20",
    Out: "bg-destructive/15 text-destructive border-destructive/30",
    "Short Closed": "bg-slate-500/15 text-slate-500 border-slate-500/30",
};

export const StatusBadge = ({ status, label }) => (
    <span
        className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
            map[status]
        )}
    >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {label ?? status}
    </span>
);