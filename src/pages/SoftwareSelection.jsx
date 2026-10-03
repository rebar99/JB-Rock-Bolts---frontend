import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Warehouse, ShieldCheck, LogOut, ArrowRight, CheckCircle2, Circle, BellRing } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import jbEngineeringLogo from "@/assets/jb-engineering-logo.jpg";
import { fetchMyPendingPOApprovals, fetchOnlineUsers, openLogStream, fetchApplicationAccessUsers, forceLogoutUser } from "@/lib/api";
import { toast } from "sonner";

const apps = [
    { code: "marketing", title: "Marketing", subtitle: "Marketing & Sales Management", description: "Manage customer activity, sales records, reports and business performance.", icon: Megaphone, route: "/marketing", accent: "from-violet-600 to-indigo-700", pale: "bg-violet-50", iconClass: "text-violet-700", ring: "group-hover:ring-violet-300" },
    { code: "store_purchase", title: "Store Purchase", subtitle: "Purchase, Stock & Inventory", description: "Track purchasing, stock levels and your store inventory in one place.", icon: Warehouse, route: "/store-purchase", accent: "from-cyan-600 to-blue-700", pale: "bg-cyan-50", iconClass: "text-cyan-700", ring: "group-hover:ring-cyan-300" },
];

export default function SoftwareSelection() {
    const { user, applicationRole, activeApplication, selectApplication, logout, refreshUser } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [approvalPopupOpen, setApprovalPopupOpen] = useState(false);
    // "checking" blocks rendering until we confirm multi-workspace access.
    // If cached user data already shows both workspaces (or super admin), skip the
    // network wait and render immediately — no 2-second white flash on Switch Software.
    const hasMultiWorkspaceCached = (() => {
        if (!user) return false;
        if (user.is_super_admin) return true;
        const access = user?.application_access ?? {};
        const hasMarketing = access.marketing && access.marketing !== "none";
        const hasStore = access.store_purchase && access.store_purchase !== "none";
        return !!(hasMarketing && hasStore);
    })();
    const [checking, setChecking] = useState(!hasMultiWorkspaceCached);
    const isSuperAdminUser = Boolean(user?.is_super_admin || user?.email?.toLowerCase() === "deepikar412003@gmail.com");
    const available = isSuperAdminUser ? apps : apps.filter((app) => applicationRole(app.code) !== "none");
    const choose = (app) => { selectApplication(app.code); navigate(app.route); };

    useEffect(() => {
        if (!user) { setChecking(false); return; }

        // Helper: given an access map, redirect if single-workspace.
        // Returns true if redirect was triggered.
        const tryRedirect = (accessUser) => {
            if (accessUser.is_super_admin) return false; // Super Admin always sees selection
            const access = accessUser?.application_access ?? {};
            const hasMarketing = access.marketing && access.marketing !== "none";
            const hasStore = access.store_purchase && access.store_purchase !== "none";
            if (hasMarketing && !hasStore) {
                selectApplication("marketing");
                navigate("/marketing", { replace: true });
                return true;
            } else if (hasStore && !hasMarketing) {
                selectApplication("store_purchase");
                navigate("/store-purchase", { replace: true });
                return true;
            }
            return false;
        };

        // STEP 1: Check local (cached) data INSTANTLY — no network request.
        // This eliminates the flash for users whose workspace hasn't changed.
        const redirectedLocally = tryRedirect(user);
        if (redirectedLocally) return; // Done — navigating away

        // STEP 2: Fetch fresh server data to catch Super Admin workspace changes.
        // Show page only after confirming the user truly has both-workspace access.
        const doFreshCheck = async () => {
            const fresh = await refreshUser();
            if (fresh) {
                const redirectedFresh = tryRedirect(fresh);
                if (redirectedFresh) return;
            }
            // Confirmed: user has both workspaces — show selection page
            setChecking(false);
        };
        doFreshCheck();
    }, [user?.id]);
    const { data: onlineUsers = [] } = useQuery({
        queryKey: ["portal-online-users"], queryFn: fetchOnlineUsers,
        refetchInterval: 10_000, staleTime: 5_000, enabled: !!user,
    });
    // Fetch all users with roles (only super admins can see this; others get empty array)
    const { data: allUsersAccess = [] } = useQuery({
        queryKey: ["application-access-users"],
        queryFn: fetchApplicationAccessUsers,
        enabled: !!isSuperAdminUser,
        staleTime: 60_000,
    });
    const { data: pendingApprovals = [] } = useQuery({
        queryKey: ["my-pending-po-approvals"], queryFn: fetchMyPendingPOApprovals,
        enabled: !!user && applicationRole("store_purchase") !== "none", refetchInterval: 30_000,
    });
    useEffect(() => {
        if (pendingApprovals.length) setApprovalPopupOpen(true);
    }, [pendingApprovals.length]);
    const openApprovals = () => { setApprovalPopupOpen(false); selectApplication("store_purchase"); navigate("/store-purchase/approvals"); };

    const [dismissedUserIds, setDismissedUserIds] = useState(() => new Set());

    const handleForceLogout = async (userId, userName) => {
        if (!window.confirm(`Force logout ${userName}? They will be immediately logged out.`)) return;
        try {
            await forceLogoutUser(userId);
            setDismissedUserIds((prev) => new Set(prev).add(userId));
            toast.success(`${userName} has been logged out.`);
            queryClient.invalidateQueries({ queryKey: ["portal-online-users"] });
            queryClient.invalidateQueries({ queryKey: ["online_users"] });
        } catch (e) {
            toast.error(e.message || "Failed to force logout user.");
        }
    };

    // The selection screen is part of the authenticated portal, so it also
    // registers the active browser in the existing live-presence service.
    useEffect(() => {
        if (!user) return undefined;
        const stream = openLogStream(
            () => queryClient.invalidateQueries({ queryKey: ["portal-online-users"] }),
            () => {}, user, "Software Selection",
        );
        const refresh = setTimeout(() => queryClient.invalidateQueries({ queryKey: ["portal-online-users"] }), 500);
        return () => { clearTimeout(refresh); stream.close(); };
    }, [user?.id, queryClient]);

    const visibleOnlineUsers = useMemo(() => {
        const filtered = onlineUsers.filter((member) => !dismissedUserIds.has(member.user_id));
        const currentAlreadyPresent = filtered.some((member) => member.user_id === user?.id);
        return currentAlreadyPresent || !user
            ? filtered
            : [{ user_id: user.id, user_name: user.name, user_email: user.email, is_active: true, workspace: "Software Selection" }, ...filtered];
    }, [onlineUsers, user, dismissedUserIds]);

    // Build a role label for each online user
    const roleMap = useMemo(() => {
        const map = {};
        // Super Admin always knows their own role
        if (isSuperAdminUser) map[user.id] = "Super Admin";
        // Fill from allUsersAccess (super admin only)
        for (const u of allUsersAccess) {
            if (u.is_super_admin) { map[u.id] = "Super Admin"; continue; }
            const mktRole = u.application_access?.marketing;
            const stRole = u.application_access?.store_purchase;
            if (mktRole === "admin" || stRole === "admin") { map[u.id] = "Admin"; continue; }
            map[u.id] = "User";
        }
        // For non-super-admins: derive their own role from their user object
        if (!isSuperAdminUser && user?.id && !map[user.id]) {
            const mkt = user.application_access?.marketing;
            const st = user.application_access?.store_purchase;
            if (mkt === "admin" || st === "admin") map[user.id] = "Admin";
            else map[user.id] = "User";
        }
        return map;
    }, [allUsersAccess, user]);
    // While verifying workspace access, show a matching background — not a white flash.
    if (checking) return (
        <main className="relative min-h-screen overflow-hidden bg-slate-950 flex items-center justify-center">
            <div className="absolute inset-x-0 top-0 h-[460px] bg-gradient-to-br from-slate-950 via-[#132c58] to-violet-800" />
            <div className="relative z-10 flex flex-col items-center gap-4">
                <div className="h-8 w-8 rounded-full border-4 border-white/20 border-t-white animate-spin" />
                <p className="text-sm text-white/60">Loading workspace...</p>
            </div>
        </main>
    );

    return <main className="relative min-h-screen overflow-hidden bg-slate-50 px-5 py-6 sm:px-8 lg:px-12">
        <div className="absolute inset-x-0 top-0 h-[460px] sm:h-[480px] bg-gradient-to-br from-slate-950 via-[#132c58] to-violet-800" />
        <div className="absolute -top-32 right-[8%] h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute top-44 -left-24 h-64 w-64 rounded-full bg-violet-400/20 blur-3xl" />

        <section className="relative mx-auto w-full max-w-6xl">
            <header className="flex items-center justify-between gap-4 border-b border-white/15 py-3 text-white sm:py-5">
                <div className="flex items-center gap-3 sm:gap-4">
                    <div className="flex h-12 w-[84px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1.5 shadow-md ring-1 ring-white/25 sm:h-14 sm:w-[98px]">
                        <img src={jbEngineeringLogo} alt="JB Engineering" className="h-full w-full object-contain" />
                    </div>
                    <div><p className="text-xl font-extrabold tracking-wide sm:text-2xl">JB ENGINEERING</p><p className="mt-0.5 text-xs font-medium tracking-wide text-slate-300">BUSINESS OPERATIONS PORTAL</p></div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                    {visibleOnlineUsers.length > 0 && (
                        <div className="hidden items-center -space-x-2 sm:flex" title={`${visibleOnlineUsers.length} users online`}>
                            {visibleOnlineUsers.slice(0, 4).map((member) => {
                                const initials = (member.user_name || "?").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
                                const wsLabel = (isSuperAdminUser && member.workspace) ? ` (${member.workspace})` : "";
                                return <span key={member.user_id} className="relative grid h-8 w-8 place-items-center rounded-full border-2 border-[#183260] bg-gradient-to-br from-cyan-500 to-indigo-600 text-[10px] font-bold text-white" title={`${member.user_name || member.user_email}${wsLabel}`}>{initials}<span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#183260] bg-emerald-400" /></span>;
                            })}
                        </div>
                    )}
                    <div className="hidden items-center gap-2 border-l border-white/15 pl-3 sm:flex">
                        <span className="relative grid h-9 w-9 place-items-center rounded-full bg-white text-xs font-bold text-[#193465]">{(user?.name || "?").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}<span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#17315e] bg-emerald-400" /></span>
                        <div className="max-w-[150px] leading-tight"><p className="truncate text-xs font-bold">{user?.name}</p><p className="truncate text-[10px] text-slate-300">{user?.email}</p></div>
                    </div>
                    <span className="hidden rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-bold text-emerald-200 md:inline-flex"><Circle className="mr-1 h-2 w-2 fill-current" />{visibleOnlineUsers.length} online</span>
                    {isSuperAdminUser && <><Button variant="outline" onClick={() => navigate("/admin/application-access")} className="hidden border-cyan-300/35 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-100 hover:text-slate-900 lg:inline-flex"><ShieldCheck className="mr-2 h-4 w-4" />Application Access</Button><Button variant="outline" onClick={() => navigate("/admin/po-approval-settings")} className="hidden border-cyan-300/35 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-100 hover:text-slate-900 lg:inline-flex"><ShieldCheck className="mr-2 h-4 w-4" />PO Approval Settings</Button></>}
                    <Button variant="outline" onClick={logout} className="border-white/25 bg-white/10 text-white hover:bg-white hover:text-slate-900"><LogOut className="mr-2 h-4 w-4" />Logout</Button>
                </div>
            </header>

            <div className="pt-8 pb-6 text-center text-white sm:pt-12 sm:pb-8">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-slate-100 backdrop-blur"><CheckCircle2 className="h-3.5 w-3.5 text-cyan-300" />Signed in as {user?.name}</div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Choose your workspace</h1>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base px-4">Select an application to continue. Your access level is clearly shown on each workspace.</p>
            </div>

            {pendingApprovals.length > 0 && <button type="button" onClick={() => setApprovalPopupOpen(true)} className="mx-auto mb-6 flex max-w-2xl items-center gap-3 rounded-xl border border-amber-300/50 bg-amber-50 px-5 py-3 text-left text-amber-950 shadow-lg"><BellRing className="h-5 w-5 shrink-0 text-amber-600" /><span><b>{pendingApprovals.length} PO approval{pendingApprovals.length === 1 ? "" : "s"} required</b><span className="block text-sm">Click to review the Purchase Orders assigned to you.</span></span></button>}

            {available.length ? <div className="mx-auto grid max-w-3xl gap-4 pb-7 md:grid-cols-2">{available.map(({ icon: Icon, ...app }) => {
                const isAdmin = applicationRole(app.code) === "admin";
                return <button key={app.code} onClick={() => choose(app)} className={`group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl shadow-slate-900/10 transition duration-300 hover:-translate-y-1.5 hover:shadow-2xl focus:outline-none focus-visible:ring-4 ${app.ring}`}>
                    <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${app.accent}`} />
                    <div className="flex items-start justify-between gap-4">
                        <div className={`grid h-10 w-10 place-items-center rounded-lg ${app.pale}`}><Icon className={`h-5 w-5 ${app.iconClass}`} /></div>
                        <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${isAdmin ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{isAdmin ? "Admin access" : "View only"}</span>
                    </div>
                    <div className="mt-4"><p className="text-lg font-bold text-slate-900">{app.title}</p><p className="mt-0.5 text-xs font-medium text-slate-500">{app.subtitle}</p><p className="mt-2 min-h-9 text-xs leading-5 text-slate-600">{app.description}</p></div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><span className={`text-xs font-bold ${app.iconClass}`}>Open workspace</span><span className={`grid h-7 w-7 place-items-center rounded-full bg-gradient-to-r text-white transition-transform group-hover:translate-x-1 ${app.accent}`}><ArrowRight className="h-3.5 w-3.5" /></span></div>
                </button>;
            })}</div> : <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-xl"><ShieldCheck className="mx-auto h-10 w-10 text-slate-400"/><h2 className="mt-4 text-xl font-bold">No application access assigned</h2><p className="mt-2 text-slate-500">Please contact the system administrator.</p></div>}

            {/* ── Who's Online ────────────────────── */}
            {visibleOnlineUsers.length > 0 && (
                <div className="mx-auto mb-6 max-w-3xl">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"/><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"/></span>
                        <p className="text-sm font-semibold text-slate-700">{visibleOnlineUsers.length} user{visibleOnlineUsers.length !== 1 ? "s" : ""} online</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                        {visibleOnlineUsers.map((member) => {
                            const initials = (member.user_name || "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
                            const isMe = member.user_id === user?.id;
                            const role = roleMap[member.user_id] || (isMe && isSuperAdminUser ? "Super Admin" : "User");
                            const roleStyle = role === "Super Admin"
                                ? "bg-violet-100 text-violet-700"
                                : role === "Admin"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-slate-100 text-slate-600";
                            return (
                                <div key={member.user_id} className={`flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 shadow-sm ${isMe ? "border-emerald-200 ring-1 ring-emerald-200" : "border-slate-200"}`}>
                                    <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-500 to-indigo-600 text-[11px] font-bold text-white">
                                        {initials}
                                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400"/>
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-semibold text-slate-900">{member.user_name || "Unknown"}{isMe && <span className="ml-1 text-emerald-600 font-normal">(you)</span>}</p>
                                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                            <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold ${roleStyle}`}>{role}</span>
                                            {member.workspace && (
                                                <span className="inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                                    {member.workspace}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {isSuperAdminUser && !isMe && (
                                        <button
                                            onClick={() => handleForceLogout(member.user_id, member.user_name || "User")}
                                            className="shrink-0 ml-1 rounded-lg p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                            title={`Force logout ${member.user_name}`}
                                        >
                                            <LogOut className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <p className="pb-2 text-center text-xs text-slate-500">Secure business portal · One login, multiple workspaces</p>
        </section>
        <Dialog open={approvalPopupOpen} onOpenChange={setApprovalPopupOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle className="flex items-center gap-2 text-amber-700"><BellRing className="h-5 w-5" />New PO Approval Required</DialogTitle><DialogDescription>You have Purchase Orders waiting for your approval.</DialogDescription></DialogHeader><div className="max-h-72 space-y-3 overflow-y-auto">{pendingApprovals.map(order => <div key={order.id} className="rounded-lg border bg-slate-50 p-3 text-sm"><p className="font-bold text-slate-900">{order.order_number} · ₹{Number(order.grand_total || 0).toLocaleString("en-IN")}</p><p className="mt-1 text-slate-600">Vendor: {order.supplier}</p><p className="text-slate-600">Requested by: {order.created_by || "—"}</p></div>)}</div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setApprovalPopupOpen(false)}>Later</Button><Button onClick={openApprovals}>View PO Approvals</Button></div></DialogContent></Dialog>
    </main>;
}
