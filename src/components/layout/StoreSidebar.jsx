import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeftRight, Boxes, Database, FileBarChart2, PackageCheck, ShoppingCart, Trash2, Truck, Warehouse } from "lucide-react";
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

export default function StoreSidebar() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, applicationRole, selectApplication } = useAuth();
    const slug = location.pathname.split("/")[2] || "purchase";
    const role = applicationRole("store_purchase");
    const isAdmin = user?.is_super_admin || user?.is_admin || role === "admin";

    return (
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
            <div className="border-b border-sidebar-border px-5 py-5">
                <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400/15 text-cyan-200">
                        <Warehouse className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="font-bold text-white">Store Purchase</p>
                        <p className="text-[10px] tracking-wider text-sidebar-foreground/60">MANAGEMENT SYSTEM</p>
                    </div>
                </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-1">
                <p className="px-3 pb-2 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Main Menu</p>
                {menu.map(([label, target, Icon]) => (
                    <button
                        key={target}
                        onClick={() => navigate(target === "purchase" ? "/store-purchase" : `/store-purchase/${target}`)}
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
                        <div className="px-3 pt-5 pb-2 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
                            Admin
                        </div>
                        <button
                            onClick={() => navigate("/store-purchase/system-backup")}
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
                            onClick={() => navigate("/store-purchase/recently-deleted")}
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

            <div className="p-4 border-t border-sidebar-border space-y-2">
                <div className="rounded-lg bg-sidebar-accent/40 p-3">
                    <div className="text-xs font-semibold text-white">Store Purchase</div>
                    <div className="text-[11px] text-sidebar-foreground/70 mt-0.5">
                        Management System v2.5
                    </div>
                </div>
            </div>
        </aside>
    );
}
