import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeftRight, BookOpen, Warehouse, Megaphone, Menu, X, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

const menu = [
    ["Store Accounts", "store", Warehouse],
    ["Marketing Accounts", "marketing", Megaphone],
];

function SidebarContent({ tab, navigate, onClose }) {
    const { selectApplication } = useAuth();

    const go = (target) => {
        navigate(`/accounts/${target}`);
        onClose?.();
    };

    return (
        <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
            {/* Header */}
            <div className="border-b border-sidebar-border px-5 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300">
                        <Landmark className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="font-bold text-white">Accounts</p>
                        <p className="text-[10px] tracking-wider text-sidebar-foreground/60">WORKSPACE</p>
                    </div>
                </div>
                {/* Close button — mobile only */}
                {onClose && (
                    <button onClick={onClose} className="lg:hidden text-sidebar-foreground/60 hover:text-white p-1">
                        <X className="h-5 w-5" />
                    </button>
                )}
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-1">
                <p className="px-3 pb-2 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Accounts Tabs</p>
                {menu.map(([label, target, Icon]) => (
                    <button
                        key={target}
                        onClick={() => go(target)}
                        className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all",
                            tab === target
                                ? "border-l-2 border-emerald-400 bg-sidebar-accent text-white shadow-sm"
                                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
                        )}
                    >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{label}</span>
                    </button>
                ))}
            </nav>

            {/* Switch Software & Footer */}
            <div className="p-4 border-t border-sidebar-border space-y-3">
                <button
                    onClick={() => {
                        selectApplication(null);
                        navigate("/");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg bg-sidebar-accent/50 px-3 py-2 text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-white transition"
                >
                    <ArrowLeftRight className="h-4 w-4" />
                    <span>Switch Software</span>
                </button>
                <div className="rounded-lg bg-sidebar-accent/30 p-2.5 text-center">
                    <div className="text-[11px] font-semibold text-white">Accounts Workspace</div>
                    <div className="text-[10px] text-sidebar-foreground/60">Store & Marketing Accounts</div>
                </div>
            </div>
        </div>
    );
}

export default function AccountsSidebar({ mobileOpen: controlledOpen, onOpenChange }) {
    const navigate = useNavigate();
    const location = useLocation();
    const tab = location.pathname.split("/")[2] || "store";
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const isControlled = controlledOpen !== undefined;
    const mobileOpen = isControlled ? controlledOpen : uncontrolledOpen;
    const setMobileOpen = (val) => {
        if (isControlled) {
            onOpenChange?.(val);
        } else {
            setUncontrolledOpen(val);
        }
    };

    return (
        <>
            {/* Mobile hamburger button */}
            <button
                onClick={() => setMobileOpen(true)}
                className="fixed top-4 left-4 z-40 lg:hidden flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar text-white shadow-lg"
                aria-label="Open menu"
            >
                <Menu className="h-5 w-5" />
            </button>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Mobile drawer */}
            <div
                className={cn(
                    "fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:hidden",
                    mobileOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <SidebarContent
                    tab={tab}
                    navigate={navigate}
                    onClose={() => setMobileOpen(false)}
                />
            </div>

            {/* Desktop sidebar */}
            <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
                <SidebarContent tab={tab} navigate={navigate} />
            </aside>
        </>
    );
}
