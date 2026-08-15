import { useState, useEffect, useMemo } from "react";
import { Bell, LogOut, Menu, Moon, Search, Sun, Users, Activity, Circle, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchLogs, openLogStream, fetchOnlineUsers, fetchRecentLogins } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { relativeTimeIST, fmtDateTimeIST } from "@/lib/timezone";

// ── Entity-type colour map ────────────────────────────────────────────────────
const ENTITY_COLORS = {
    User:          { bg: "bg-violet-500/15", text: "text-violet-600 dark:text-violet-400", dot: "bg-violet-500" },
    Client:        { bg: "bg-blue-500/15",   text: "text-blue-600 dark:text-blue-400",   dot: "bg-blue-500"   },
    Project:       { bg: "bg-cyan-500/15",   text: "text-cyan-600 dark:text-cyan-400",   dot: "bg-cyan-500"   },
    PurchaseOrder: { bg: "bg-amber-500/15",  text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500"  },
    Sale:          { bg: "bg-green-500/15",  text: "text-green-600 dark:text-green-400", dot: "bg-green-500"  },
    Product:       { bg: "bg-orange-500/15", text: "text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
};
const entityStyle = (type) =>
    ENTITY_COLORS[type] || { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" };

// ── Activity Log Item ─────────────────────────────────────────────────────────
function LogItem({ log, isNew }) {
    const style = entityStyle(log.entity_type);
    return (
        <div className={`flex flex-col gap-1.5 px-3 py-2.5 border-b border-border last:border-0 transition-colors ${
            isNew ? "bg-accent/10 hover:bg-accent/15" : "hover:bg-muted/40"
        }`}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${style.dot}`} />
                    <span className={`text-[11px] font-semibold ${style.text} truncate`}>
                        {log.action}
                    </span>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0"
                    title={fmtDateTimeIST(log.created_at)}>
                    {relativeTimeIST(log.created_at)}
                </span>
            </div>
            {log.entity_name && (
                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded w-fit ${style.bg} ${style.text}`}>
                    {log.entity_name}
                </span>
            )}
            {log.details && (
                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {log.details}
                </p>
            )}
            {log.changed_fields && (
                <p className="text-[10px] text-muted-foreground">
                    <span className="font-medium text-foreground/70">Changed:</span>{" "}
                    {log.changed_fields}
                </p>
            )}
            <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                    By: <span className="font-medium text-foreground/80">{log.user || "System"}</span>
                </span>
                {log.status && log.status !== "Success" && (
                    <span className="text-[10px] font-medium text-destructive">{log.status}</span>
                )}
            </div>
        </div>
    );
}

// ── Online User Row ───────────────────────────────────────────────────────────
function OnlineUserRow({ session, isCurrentUser }) {
    const initials = (session.user_name || "?")
        .split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

    return (
        <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
            <div className="relative shrink-0">
                <div className={`h-8 w-8 rounded-full grid place-items-center text-xs font-bold text-white ${
                    isCurrentUser
                        ? "bg-gradient-to-br from-primary to-primary/70"
                        : "bg-gradient-to-br from-slate-500 to-slate-400"
                }`}>
                    {initials}
                </div>
                {session.is_active ? (
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-card" />
                ) : (
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-slate-400 border-2 border-card" />
                )}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground truncate">
                    {session.user_name}
                    {isCurrentUser && (
                        <span className="ml-1.5 text-[9px] font-medium text-primary bg-primary/10 px-1 py-0.5 rounded">
                            You
                        </span>
                    )}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{session.user_email}</p>
            </div>
            <div className="text-right shrink-0">
                {session.is_active ? (
                    <p className="text-[10px] text-green-600 dark:text-green-400 font-medium flex items-center gap-1 justify-end">
                        <Circle className="h-1.5 w-1.5 fill-current" /> Online
                    </p>
                ) : (
                    <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1 justify-end">
                        <Circle className="h-1.5 w-1.5 fill-current" /> Offline
                    </p>
                )}
                <p className="text-[10px] text-muted-foreground"
                    title={session.login_at ? fmtDateTimeIST(session.login_at) : (session.connected_at ? fmtDateTimeIST(session.connected_at) : "")}>
                    {session.login_at ? relativeTimeIST(session.login_at) : (session.connected_at ? relativeTimeIST(session.connected_at) : "Just now")}
                </p>
            </div>
        </div>
    );
}

// ── Main Topbar ───────────────────────────────────────────────────────────────
export const Topbar = ({ onMenu }) => {
    const { theme, toggle } = useTheme();
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [activeTab, setActiveTab] = useState("activity");
    const displayName = user?.name || "Admin User";

    const [sseBuffer, setSseBuffer] = useState([]);
    const [newCount, setNewCount] = useState(0);

    // ── Polled logs ───────────────────────────────────────────────────────────
    const { data: queryLogs = [] } = useQuery({
        queryKey: ["system_logs"],
        queryFn: () => fetchLogs(100),
        refetchInterval: 30_000,
        staleTime: 25_000,
    });

    // ── Online users (SSE-tracked, polled every 10 s as fallback) ─────────────
    const { data: apiOnline = [] } = useQuery({
        queryKey: ["online_users"],
        queryFn: fetchOnlineUsers,
        refetchInterval: 10_000,
        staleTime: 0,
        refetchOnWindowFocus: true,
    });

    // ── Recent Logins (polled every 60s) ───────────────────────────────────────
    const { data: recentLogins = [] } = useQuery({
        queryKey: ["recent_logins"],
        queryFn: fetchRecentLogins,
        refetchInterval: 60_000,
        staleTime: 30_000,
    });

    // ── Always show current user even before server confirms ──────────────────
    // The SSE connection might not yet be indexed by the server on first render.
    // Inject the current user from AuthContext so they appear instantly, then
    // deduplicate once the API confirms the SSE connection is registered.
    const activeSessions = useMemo(() => {
        if (!user) return apiOnline;
        const alreadyIn = apiOnline.some((s) => s.user_id === user.id);
        if (alreadyIn) return apiOnline;
        return [
            { user_id: user.id, user_name: user.name, user_email: user.email, connected_at: null },
            ...apiOnline,
        ];
    }, [apiOnline, user]);

    // ── SSE connection — passing user registers this browser as "online" ──────
    // The server adds the user to its in-memory online dict when the SSE
    // connection opens, and removes them when it closes (tab close / logout).
    useEffect(() => {
        if (!user) return;

        const es = openLogStream(
            (log) => {
                setSseBuffer((prev) => [log, ...prev].slice(0, 100));
                setNewCount((n) => n + 1);
                // Refresh the online list whenever any user logs in or out
                if (log.entity_type === "User") {
                    queryClient.invalidateQueries({ queryKey: ["online_users"] });
                }
            },
            null,
            user,   // <── registers this browser as online via SSE query params
        );

        // Also trigger an immediate refresh after the SSE connection is established
        // (tiny delay to let the server process the new connection)
        const t = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ["online_users"] });
        }, 800);

        return () => {
            clearTimeout(t);
            es.close();
        };
    // Re-run when the logged-in user changes (logout → re-login with different account)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    // ── Merged log list ───────────────────────────────────────────────────────
    const logs = useMemo(() => {
        const merged = [...sseBuffer, ...queryLogs];
        const seen = new Set();
        return merged.filter((l) => { if (seen.has(l.id)) return false; seen.add(l.id); return true; })
            .slice(0, 100);
    }, [sseBuffer, queryLogs]);

    const handleOpenChange = (open) => { if (open) setNewCount(0); };

    const handleLogout = async () => {
        await logout();
        navigate("/login", { replace: true });
    };

    const initials = displayName.split(" ").map((n) => n[0]).filter(Boolean)
        .slice(0, 2).join("").toUpperCase() || "AU";

    const onlineCount = activeSessions.length;

    return (
        <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-md border-b border-border">
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-[100] flex items-start justify-center pt-32 bg-background/80 backdrop-blur-sm">
                    <div className="w-[90%] max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-foreground">Confirm Logout</h3>
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                            Are you sure you want to logout?
                        </p>
                        <div className="mt-6 flex flex-col sm:flex-row gap-3">
                            <Button variant="outline" className="flex-1" onClick={() => setShowLogoutConfirm(false)}>
                                Cancel
                            </Button>
                            <Button variant="destructive" className="flex-1 shadow-sm font-semibold" onClick={handleLogout}>
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
                        <Input placeholder="Search clients, orders, invoices..."
                            className="pl-9 bg-secondary/60 border-transparent focus-visible:bg-card" />
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
                                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 rounded-full bg-accent text-white text-[9px] font-bold grid place-items-center leading-none">
                                    {newCount > 9 ? "9+" : newCount}
                                </span>
                            ) : logs.length > 0 && (
                                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent animate-pulse" />
                            )}
                        </Button>
                    </PopoverTrigger>

                    <PopoverContent className="w-[340px] p-0 mr-4 mt-2 shadow-xl" align="end">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                            <h4 className="font-semibold text-sm">Notifications</h4>
                            <div className="flex items-center gap-1.5">
                                {onlineCount > 0 && (
                                    <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 font-medium bg-green-500/10 px-1.5 py-0.5 rounded-full">
                                        <Circle className="h-1.5 w-1.5 fill-current" />
                                        {onlineCount} online
                                    </span>
                                )}
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                    {logs.length} logs
                                </span>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-border bg-muted/20">
                            <button onClick={() => setActiveTab("activity")}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                                    activeTab === "activity"
                                        ? "text-primary border-b-2 border-primary bg-background"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}>
                                <Activity className="h-3.5 w-3.5" /> Activity
                            </button>
                            <button onClick={() => setActiveTab("online")}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                                    activeTab === "online"
                                        ? "text-primary border-b-2 border-primary bg-background"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}>
                                <Users className="h-3.5 w-3.5" />
                                Online{onlineCount > 0 && ` (${onlineCount})`}
                            </button>
                            <button onClick={() => setActiveTab("logins")}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                                    activeTab === "logins"
                                        ? "text-primary border-b-2 border-primary bg-background"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}>
                                <History className="h-3.5 w-3.5" /> History
                            </button>
                        </div>

                        <div className="max-h-[420px] overflow-y-auto">
                            {activeTab === "activity" && (
                                logs.length === 0
                                    ? <div className="p-6 text-center text-sm text-muted-foreground">No recent activities.</div>
                                    : <div className="flex flex-col">
                                        {logs.map((log) => (
                                            <LogItem key={log.id} log={log}
                                                isNew={sseBuffer.some((s) => s.id === log.id)} />
                                        ))}
                                    </div>
                            )}

                            {activeTab === "online" && (
                                <>
                                    {activeSessions.length === 0
                                        ? <div className="p-6 text-center text-sm text-muted-foreground">No users currently online.</div>
                                        : <div className="flex flex-col">
                                            {activeSessions.map((s) => (
                                                <OnlineUserRow key={s.user_id} session={s}
                                                    isCurrentUser={s.user_id === user?.id} />
                                            ))}
                                        </div>
                                    }
                                    <div className="px-3 py-2 border-t border-border bg-muted/20 text-[10px] text-muted-foreground text-center">
                                        Live via SSE · refreshes every 10 s
                                    </div>
                                </>
                            )}
                            
                            {activeTab === "logins" && (
                                recentLogins.length === 0
                                    ? <div className="p-6 text-center text-sm text-muted-foreground">No recent logins.</div>
                                    : <div className="flex flex-col">
                                        {recentLogins.map((s) => (
                                            <OnlineUserRow key={s.id} session={s}
                                                isCurrentUser={s.user_id === user?.id} />
                                        ))}
                                    </div>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>

                <div className="flex items-center gap-2 pl-3 border-l border-border ml-2">
                    {/* Inline Online Avatars */}
                    {activeSessions.length > 0 && (
                        <div className="hidden sm:flex items-center -space-x-2 mr-3 pr-3 border-r border-border">
                            {activeSessions.slice(0, 5).map((session, i) => {
                                const sInitials = (session.user_name || "?")
                                    .split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
                                const isCur = session.user_id === user?.id;
                                return (
                                    <div key={session.user_id} 
                                         className={`relative h-8 w-8 rounded-full border-2 border-background grid place-items-center text-[10px] font-bold text-white shadow-sm hover:z-10 hover:scale-110 transition-transform cursor-default ${
                                             isCur ? "bg-gradient-to-br from-primary to-primary/70" : "bg-gradient-to-br from-slate-500 to-slate-400"
                                         }`}
                                         title={`${session.user_name} (${isCur ? 'You' : 'Online'})`}
                                         style={{ zIndex: 10 - i }}
                                    >
                                        {sInitials}
                                        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 border-2 border-background" />
                                    </div>
                                );
                            })}
                            {activeSessions.length > 5 && (
                                <div className="relative h-8 w-8 rounded-full border-2 border-background bg-muted grid place-items-center text-[10px] font-bold text-muted-foreground shadow-sm z-0">
                                    +{activeSessions.length - 5}
                                </div>
                            )}
                        </div>
                    )}
                    
                    <div className="hidden sm:block text-right leading-tight">
                        <div className="text-sm font-semibold text-foreground">{displayName}</div>
                        <div className="text-[11px] text-muted-foreground">{user?.email || "Active User"}</div>
                    </div>
                    <div className="h-9 w-9 rounded-full bg-gradient-primary grid place-items-center text-primary-foreground font-semibold text-sm shrink-0">
                        {initials}
                    </div>
                    <Button variant="outline" onClick={() => setShowLogoutConfirm(true)} title="Sign out"
                        className="border-destructive/30 text-destructive hover:bg-destructive hover:text-white flex items-center gap-2 px-3 h-9 rounded-md transition-all shadow-sm ml-2 font-bold">
                        <LogOut className="h-4 w-4" />
                        <span className="hidden md:inline text-sm font-medium">Logout</span>
                    </Button>
                </div>
            </div>
        </header>
    );
};
