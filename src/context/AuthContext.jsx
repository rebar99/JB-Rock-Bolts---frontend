import { createContext, useContext, useEffect, useState, useRef } from "react";
import { logoutUser, post, fetchMyAccess } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const AuthContext = createContext(null);

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const ACTIVE_APP_KEY = "active_application";

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
    const [user, setUser] = useState(() => {
        try {
            const stored = localStorage.getItem(USER_KEY);
            const parsed = stored ? JSON.parse(stored) : null;
            if (parsed && (parsed.is_super_admin || parsed.email?.toLowerCase() === "deepikar412003@gmail.com")) {
                parsed.is_super_admin = true;
                parsed.application_access = { marketing: "admin", store_purchase: "admin" };
            }
            if (parsed && (parsed.is_super_admin || parsed.application_access?.marketing === "admin")) {
                parsed.is_admin = true;
            }
            return parsed;
        } catch {
            return null;
        }
    });
    const [activeApplication, setActiveApplication] = useState(() => localStorage.getItem(ACTIVE_APP_KEY) || null);

    const [loginAttempt, setLoginAttempt] = useState(null);
    const ws = useRef(null);

    useEffect(() => {
        if (!token) return;

        const connectWs = () => {
            const BASE = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
            const wsUrl = `${BASE.replace("http://", "ws://").replace("https://", "wss://")}/api/users/ws/auth?token=${token}`;
            ws.current = new WebSocket(wsUrl);

            ws.current.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "LOGIN_ATTEMPT") {
                    setLoginAttempt(data);
                } else if (data.type === "FORCE_LOGOUT") {
                    toast.error(data.message || "Your session has been terminated by the administrator.");
                    logout();
                }
            };

            ws.current.onclose = () => {
                // Reconnect after 3 seconds if still authenticated
                setTimeout(() => {
                    if (localStorage.getItem(TOKEN_KEY)) {
                        connectWs();
                    }
                }, 3000);
            };
        };

        connectWs();

        return () => {
            if (ws.current) {
                ws.current.close();
            }
        };
    }, [token]);

    const logout = async () => {
        try {
            await logoutUser();
        } catch {
            // Best-effort: clear local state even if API call fails
        }
        setToken(null);
        setUser(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem("app_current_user");
        localStorage.removeItem(ACTIVE_APP_KEY);
        setActiveApplication(null);
        window.location.href = "/login";
    };

    useEffect(() => {
        if (!token) return;

        let timeoutId;
        const TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

        const handleActivity = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                toast.error("Session expired due to inactivity.");
                logout();
            }, TIMEOUT_MS);
        };

        handleActivity();

        window.addEventListener("mousemove", handleActivity);
        window.addEventListener("keydown", handleActivity);
        window.addEventListener("click", handleActivity);
        window.addEventListener("scroll", handleActivity);

        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener("mousemove", handleActivity);
            window.removeEventListener("keydown", handleActivity);
            window.removeEventListener("click", handleActivity);
            window.removeEventListener("scroll", handleActivity);
        };
    }, [token]);
    const handleApproval = async (action) => {
        if (!loginAttempt) return;
        try {
            await post("/api/users/approve-login", {
                request_id: loginAttempt.request_id,
                action: action
            });
            toast.success(`Login ${action === 'approve' ? 'approved' : 'rejected'}.`);
        } catch (error) {
            toast.error("Failed to process action.");
        } finally {
            setLoginAttempt(null);
        }
    };

    const login = (data) => {
        const u = data.user;
        if (u && (u.is_super_admin || u.email?.toLowerCase() === "deepikar412003@gmail.com")) {
            u.is_super_admin = true;
            u.application_access = { marketing: "admin", store_purchase: "admin" };
        }
        if (u && (u.is_super_admin || u.application_access?.marketing === "admin")) {
            u.is_admin = true;
        }
        setToken(data.access_token);
        setUser(u);
        localStorage.setItem(TOKEN_KEY, data.access_token);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
        localStorage.setItem("app_current_user", u.name);

        // Auto-select workspace for users who only have access to one application.
        // Super admins always see the selection screen.
        const access = u?.application_access ?? {};
        const hasMarketing = access.marketing && access.marketing !== "none";
        const hasStore = access.store_purchase && access.store_purchase !== "none";
        if (!u?.is_super_admin && hasMarketing && !hasStore) {
            setActiveApplication("marketing");
            localStorage.setItem(ACTIVE_APP_KEY, "marketing");
        } else if (!u?.is_super_admin && hasStore && !hasMarketing) {
            setActiveApplication("store_purchase");
            localStorage.setItem(ACTIVE_APP_KEY, "store_purchase");
        } else {
            setActiveApplication(null);
            localStorage.removeItem(ACTIVE_APP_KEY);
        }
    };

    const selectApplication = (code) => {
        setActiveApplication(code);
        if (code) localStorage.setItem(ACTIVE_APP_KEY, code);
        else localStorage.removeItem(ACTIVE_APP_KEY);
    };

    // Fetch fresh access data from server and update localStorage/state.
    // Call this after Super Admin changes workspace so the user gets the latest access.
    const refreshUser = async () => {
        if (!token) return null;
        try {
            const fresh = await fetchMyAccess();
            if (fresh) {
                if (fresh.is_super_admin || fresh.email?.toLowerCase() === "deepikar412003@gmail.com") {
                    fresh.is_super_admin = true;
                    fresh.application_access = { marketing: "admin", store_purchase: "admin" };
                }
                if (fresh.is_super_admin || fresh.application_access?.marketing === "admin") {
                    fresh.is_admin = true;
                }
                setUser(fresh);
                localStorage.setItem(USER_KEY, JSON.stringify(fresh));
                localStorage.setItem("app_current_user", fresh.name);
            }
            return fresh;
        } catch {
            return null;
        }
    };

    // Returns the effective role for an application: "admin" | "user" | "none".
    // "none" means the user has no access to that application (workspace restricted).
    // Super Admin always gets "admin" for both apps regardless of access rows.
    const applicationRole = (code) => {
        if (user?.is_super_admin || user?.email?.toLowerCase() === "deepikar412003@gmail.com") return "admin";
        const role = user?.application_access?.[code];
        if (role === "admin") return "admin";
        if (!role || role === "none") return "none";
        return "user";
    };

    return (
        <AuthContext.Provider value={{ token, user, login, logout, refreshUser, activeApplication, selectApplication, applicationRole,
            isAuthenticated: !!token, isReadOnly: activeApplication ? applicationRole(activeApplication) !== "admin" : true }}>
            {children}
            {loginAttempt && (
                <Dialog open={true} onOpenChange={() => {}}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle className="text-destructive flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-alert-triangle"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                                Security Alert
                            </DialogTitle>
                            <DialogDescription className="pt-3 text-base text-foreground">
                                {loginAttempt.message || "Someone is trying to log in to your account. Is this you?"}
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between mt-4">
                            <Button variant="outline" className="w-full sm:w-auto" onClick={() => handleApproval('reject')}>
                                NO, IT'S NOT ME
                            </Button>
                            <Button className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApproval('approve')}>
                                YES, IT'S ME
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
};
