import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    ArrowLeftRight,
    CalendarCheck,
    Database,
    IndianRupee,
    LayoutDashboard,
    Menu,
    Users,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

const menu = [
    ["Dashboard", "", LayoutDashboard],
    ["Employee Details", "employees", Users],
    ["Attendance", "attendance", CalendarCheck],
    ["Salary Management", "salary", IndianRupee],
];

function SidebarContent({ slug, navigate, isAdmin, onClose }) {
    const { selectApplication } = useAuth();

    const go = (target) => {
        navigate(target === "" ? "/hr" : `/hr/${target}`);
        onClose?.();
    };

    return (
        <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
            {/* Header */}
            <div className="border-b border-sidebar-border px-5 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400/15 text-cyan-200">
                        <Users className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="font-bold text-white">HR Department</p>
                        <p className="text-[10px] tracking-wider text-sidebar-foreground/60">MANAGEMENT SYSTEM</p>
                    </div>
                </div>
                {onClose && (
                    <button onClick={onClose} className="lg:hidden text-sidebar-foreground/60 hover:text-white p-1">
                        <X className="h-5 w-5" />
                    </button>
                )}
            </div>

            {/* Navigation Menu */}
            <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-1">
                <p className="px-3 pb-2 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Main Menu</p>
                {menu.map(([label, target, Icon]) => {
                    const isActive = target === "" ? (!slug || slug === "dashboard") : slug === target;
                    return (
                        <button
                            key={label}
                            onClick={() => go(target)}
                            className={cn(
                                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all",
                                isActive
                                    ? "border-l-2 border-cyan-400 bg-sidebar-accent text-white shadow-sm"
                                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
                            )}
                        >
                            <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-cyan-300" : "text-sidebar-foreground/70")} />
                            <span>{label}</span>
                        </button>
                    );
                })}

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
                            <Database className={cn("h-4 w-4 shrink-0", slug === "system-backup" ? "text-cyan-300" : "text-sidebar-foreground/70")} />
                            <span>System Backup</span>
                        </button>
                    </>
                )}
            </nav>

            {/* Switch Software & Footer */}
            <div className="p-4 border-t border-sidebar-border space-y-2">
                <button
                    onClick={() => {
                        selectApplication(null);
                        navigate("/");
                    }}
                    className="flex w-full items-center gap-3 rounded-lg bg-sidebar-accent/50 px-3 py-2.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-white transition"
                >
                    <ArrowLeftRight className="h-4 w-4" />
                    <span>Switch Software</span>
                </button>
                <div className="rounded-lg bg-sidebar-accent/30 p-2.5">
                    <div className="text-xs font-semibold text-white">HR Department</div>
                    <div className="text-[10px] text-sidebar-foreground/60 mt-0.5">Management System v1.0</div>
                </div>
            </div>
        </div>
    );
}

export default function HRSidebar() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, applicationRole } = useAuth();
    const pathParts = location.pathname.split("/");
    const slug = pathParts[2] || "";
    const role = applicationRole("hr");
    const isAdmin = user?.is_super_admin || user?.is_admin || role === "admin";
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setMobileOpen(true)}
                className="fixed top-4 left-4 z-40 lg:hidden flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar text-white shadow-lg"
                aria-label="Open menu"
            >
                <Menu className="h-5 w-5" />
            </button>

            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <div
                className={cn(
                    "fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:hidden",
                    mobileOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <SidebarContent
                    slug={slug}
                    navigate={navigate}
                    isAdmin={isAdmin}
                    onClose={() => setMobileOpen(false)}
                />
            </div>

            <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
                <SidebarContent slug={slug} navigate={navigate} isAdmin={isAdmin} />
            </aside>
        </>
    );
}
