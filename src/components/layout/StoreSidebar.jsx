import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeftRight, Boxes, Database, FileBarChart2, Menu, PackageCheck, ShoppingCart, Trash2, Truck, Warehouse, X, ArrowLeftRight as Switch } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

const menu = [
    ["Purchase Orders", "purchase", ShoppingCart],
    ["Materials Received", "materials-received", PackageCheck],
    ["Inventory", "items", Boxes],
    ["Stock Operations", "operations", ArrowLeftRight],
    ["List Approved Vendor", "suppliers", Truck],
    ["Reports", "reports", FileBarChart2],
];

function SidebarContent({ slug, navigate, isAdmin, onClose }) {
    const { user, selectApplication } = useAuth();

    const go = (target) => {
        navigate(target === "purchase" ? "/store-purchase" : `/store-purchase/${target}`);
        onClose?.();
    };

    return (
        <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
            {/* Header */}
            <div className="border-b border-sidebar-border px-5 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400/15 text-cyan-200">
                        <Warehouse className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="font-bold text-white">Store Purchase</p>
                        <p className="text-[10px] tracking-wider text-sidebar-foreground/60">MANAGEMENT SYSTEM</p>
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
                <p className="px-3 pb-2 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Main Menu</p>
                {menu.map(([label, target, Icon]) => (
                    <button
                        key={target}
                        onClick={() => go(target)}
                        className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all",
                            slug === target
                                ? "border-l-2 border-cyan-400 bg-sidebar-accent text-white shadow-sm"
                                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
                        )}
                    >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{label}</span>
                    </button>
                ))}

                {isAdmin && (
                    <>
                        <div className="px-3 pt-5 pb-2 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Admin</div>
                        <button
                            onClick={() => go("system-backup")}
                            className={cn(
                                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all",
                                slug === "system-backup"
                                    ? "border-l-2 border-cyan-400 bg-sidebar-accent text-white shadow-sm"
                                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
                            )}
                        >
                            <Database className="h-4 w-4 shrink-0" />
                            <span>System Backup</span>
                        </button>
                        <button
                            onClick={() => go("recently-deleted")}
                            className={cn(
                                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all",
                                slug === "recently-deleted"
                                    ? "border-l-2 border-cyan-400 bg-sidebar-accent text-white shadow-sm"
                                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
                            )}
                        >
                            <Trash2 className="h-4 w-4 shrink-0" />
                            <span>Recently Deleted</span>
                        </button>
                    </>
                )}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-sidebar-border space-y-2">
                <div className="rounded-lg bg-sidebar-accent/40 p-3">
                    <div className="text-xs font-semibold text-white">Store Purchase</div>
                    <div className="text-[11px] text-sidebar-foreground/70 mt-0.5">Management System v2.5</div>
                </div>
            </div>
        </div>
    );
}

export default function StoreSidebar() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, applicationRole } = useAuth();
    const slug = location.pathname.split("/")[2] || "purchase";
    const role = applicationRole("store_purchase");
    const isAdmin = user?.is_super_admin || user?.is_admin || role === "admin";
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <>
            {/* Mobile hamburger button (shown in topbar area) */}
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
            <div className={cn(
                "fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:hidden",
                mobileOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <SidebarContent
                    slug={slug}
                    navigate={navigate}
                    isAdmin={isAdmin}
                    onClose={() => setMobileOpen(false)}
                />
            </div>

            {/* Desktop sidebar */}
            <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
                <SidebarContent slug={slug} navigate={navigate} isAdmin={isAdmin} />
            </aside>
        </>
    );
}
