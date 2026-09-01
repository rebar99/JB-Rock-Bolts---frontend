import { createContext, useContext, useEffect, useState, useRef } from "react";
import { logoutUser, post } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const AuthContext = createContext(null);

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
    const [user, setUser] = useState(() => {
        try {
            const stored = localStorage.getItem(USER_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch {
            return null;
        }
    });

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
        setToken(data.access_token);
        setUser(data.user);
        localStorage.setItem(TOKEN_KEY, data.access_token);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        localStorage.setItem("app_current_user", data.user.name);
    };

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
    };

    return (
        <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated: !!token }}>
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
