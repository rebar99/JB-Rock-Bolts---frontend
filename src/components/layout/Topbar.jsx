import { useState } from "react";
import { Bell, LogOut, Menu, Moon, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchLogs } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

export const Topbar = ({ onMenu }) => {
    const { theme, toggle } = useTheme();
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    const displayName = user?.name || "Admin User";

    const { data: logs = [] } = useQuery({
        queryKey: ["system_logs"],
        queryFn: () => fetchLogs(20),
        refetchInterval: 10000,
    });

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

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="h-5 w-5" />
                            {logs.length > 0 && (
                                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent animate-pulse" />
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0 mr-4 mt-2" align="end">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                            <h4 className="font-semibold text-sm">Notifications</h4>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{logs.length} Recent</span>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                            {logs.length === 0 ? (
                                <div className="p-4 text-center text-sm text-muted-foreground">No recent activities.</div>
                            ) : (
                                <div className="flex flex-col">
                                    {logs.map((log) => (
                                        <div key={log.id} className="flex flex-col gap-1 p-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-semibold text-primary">{log.action}</span>
                                                <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground line-clamp-2">{log.details}</p>
                                            <div className="text-[10px] text-muted-foreground mt-1">By: <span className="font-medium text-foreground">{log.user || "System"}</span></div>
                                        </div>
                                    ))}
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
