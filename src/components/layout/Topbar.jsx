import { useState, useEffect, useMemo } from "react";
import { Bell, LogOut, Menu, Moon, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchLogs, openLogStream } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { relativeTimeIST, fmtDateTimeIST } from "@/lib/timezone";

export const Topbar = ({ onMenu }) => {
    const { theme, toggle } = useTheme();
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    // ── SSE state ────────────────────────────────────────────────────────────
    // Live logs pushed by the server; prepended to the polled list.
    const [sseBuffer, setSseBuffer] = useState([]);
    // Count of notifications received since the panel was last opened.
    const [newCount, setNewCount] = useState(0);

    const displayName = user?.name || "Admin User";

    // ── Polled fallback (30 s) ────────────────────────────────────────────────
    // Primary data source for the initial load and for recovery after an SSE
    // reconnect that may have missed events while disconnected.
    const { data: queryLogs = [] } = useQuery({
        queryKey: ["system_logs"],
        queryFn: () => fetchLogs(20),
        refetchInterval: 30_000,
        staleTime: 25_000,
    });

    // ── SSE connection ────────────────────────────────────────────────────────
    useEffect(() => {
        const es = openLogStream((log) => {
            setSseBuffer(prev => [log, ...prev].slice(0, 20));
            setNewCount(n => n + 1);
        });
        // EventSource auto-reconnects on network errors; we just clean up on unmount.
        return () => es.close();
    }, []);

    // ── Merged log list ───────────────────────────────────────────────────────
    // SSE logs sit at the top; polled logs fill in history. Dedup by id.
    const logs = useMemo(() => {
        const merged = [...sseBuffer, ...queryLogs];
        const seen = new Set();
        return merged.filter(l => {
            if (seen.has(l.id)) return false;
            seen.add(l.id);
            return true;
        }).slice(0, 20);
    }, [sseBuffer, queryLogs]);

    // ── Notification panel open/close ─────────────────────────────────────────
    const handleOpenChange = (open) => {
        if (open) setNewCount(0);   // clear badge when user opens the panel
    };

    const handleLogout = () => {
        logout();
        navigate("/login", { replace: true });
    };

    const initials = displayName
        .split(" ")
        .map((n) => n[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase() || "AU";

    return (
        <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-md border-b border-border">
            {/* Custom Safe Logout Modal */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-[100] flex items-start justify-center pt-32 bg-background/80 backdrop-blur-sm">
                    <div className="w-[90%] max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-foreground">Confirm Logout</h3>
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                            Are you sure you want to logout?
                        </p>
                        <div className="mt-6 flex flex-col sm:flex-row gap-3">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => setShowLogoutConfirm(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                className="flex-1 shadow-sm font-semibold"
                                onClick={handleLogout}
                            >
                                Logout
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
                <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu}>
                    <Menu className="h-5 w-5" />
                </Button>

                <div className="hidden md:flex flex-col leading-tight mr-4">
                    <h1 className="font-bold text-base text-foreground">JB Rock Bolts Dashboard</h1>
                    <p className="text-[11px] text-muted-foreground">Marketing &amp; Sales Management System</p>
                </div>

                <div className="flex-1 max-w-md ml-auto md:ml-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search clients, orders, invoices..."
                            className="pl-9 bg-secondary/60 border-transparent focus-visible:bg-card"
                        />
                    </div>
                </div>

                <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
                    {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </Button>

                <Popover onOpenChange={handleOpenChange}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="h-5 w-5" />
                            {newCount > 0 ? (
                                /* Numbered badge for unseen notifications */
                                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 rounded-full bg-accent text-white text-[9px] font-bold grid place-items-center leading-none">
                                    {newCount > 9 ? "9+" : newCount}
                                </span>
                            ) : logs.length > 0 && (
                                /* Subtle pulse when panel has logs but nothing new */
                                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent animate-pulse" />
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0 mr-4 mt-2" align="end">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                            <h4 className="font-semibold text-sm">Notifications</h4>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                {logs.length} Recent
                            </span>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                            {logs.length === 0 ? (
                                <div className="p-4 text-center text-sm text-muted-foreground">
                                    No recent activities.
                                </div>
                            ) : (
                                <div className="flex flex-col">
                                    {logs.map((log, idx) => {
                                        // Highlight the top N entries that arrived via SSE
                                        const isNew = idx < sseBuffer.length &&
                                            sseBuffer.some(s => s.id === log.id);
                                        return (
                                            <div
                                                key={log.id}
                                                className={`flex flex-col gap-1 p-3 border-b border-border last:border-0 transition-colors ${
                                                    isNew
                                                        ? "bg-accent/10 hover:bg-accent/20"
                                                        : "hover:bg-muted/50"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-semibold text-primary truncate">
                                                        {log.action}
                                                    </span>
                                                    <span
                                                        className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0"
                                                        title={fmtDateTimeIST(log.created_at)}
                                                    >
                                                        {relativeTimeIST(log.created_at)}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-muted-foreground line-clamp-2">
                                                    {log.details}
                                                </p>
                                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                                    By:{" "}
                                                    <span className="font-medium text-foreground">
                                                        {log.user || "System"}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>

                <div className="flex items-center gap-2 pl-3 border-l border-border">
                    <div className="hidden sm:block text-right leading-tight">
                        <div className="text-sm font-semibold text-foreground">{displayName}</div>
                        <div className="text-[11px] text-muted-foreground">{user?.email || "Active User"}</div>
                    </div>
                    <div className="h-9 w-9 rounded-full bg-gradient-primary grid place-items-center text-primary-foreground font-semibold text-sm shrink-0">
                        {initials}
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => setShowLogoutConfirm(true)}
                        title="Sign out"
                        className="border-destructive/30 text-destructive hover:bg-destructive hover:text-white flex items-center gap-2 px-3 h-9 rounded-md transition-all shadow-sm ml-2 font-bold"
                    >
                        <LogOut className="h-4 w-4" />
                        <span className="hidden md:inline text-sm font-medium">Logout</span>
                    </Button>
                </div>
            </div>
        </header>
    );
};
