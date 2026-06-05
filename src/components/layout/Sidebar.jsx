import { NavLink } from "react-router-dom";
import { LayoutDashboard, FileBarChart2, FileText, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/purchase-orders", label: "Purchase Orders", icon: FileText },
    { to: "/sales-invoice", label: "Sales", icon: ShoppingCart },
    { to: "/reports", label: "Reports", icon: FileBarChart2 },
];

export const Sidebar = ({ open, onClose }) => (
    <>
        <div
            className={cn(
                "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden transition-opacity",
                open ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
            onClick={onClose}
        />
        <aside
            className={cn(
                "fixed lg:sticky top-0 left-0 z-50 h-screen w-64 shrink-0",
                "bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
                "flex flex-col transition-transform duration-300",
                open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}
        >
            <div className="px-5 py-5 border-b border-sidebar-border">
                <img 
                    src="https://jbrockbolts.com/images/rebar-couplers-logo.jpg" 
                    alt="JB Rock Bolts Logo" 
                    className="w-full h-auto object-contain rounded-xl p-1.5 bg-white shadow-glow" 
                />
            </div>

            <nav className="flex-1 px-3 py-5 space-y-1">
                <div className="px-3 pb-2 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
                    Main Menu
                </div>
                {items.map(({ to, label, icon: Icon, end }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={end}
                        onClick={onClose}
                        className={({ isActive }) =>
                            cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                isActive
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary shadow-sm"
                                    : "text-sidebar-foreground/80"
                            )
                        }
                    >
                        <Icon className="h-4 w-4 shrink-0" size={18} />
                        <span>{label}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="p-4 border-t border-sidebar-border">
                <div className="rounded-lg bg-sidebar-accent/40 p-3">
                    <div className="text-xs font-semibold text-white">Marketing & Sales</div>
                    <div className="text-[11px] text-sidebar-foreground/70 mt-0.5">
                        Management System v2.5
                    </div>
                </div>
            </div>
        </aside>
    </>
);