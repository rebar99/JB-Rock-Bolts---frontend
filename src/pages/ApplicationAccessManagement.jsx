import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
    fetchApplicationAccessUsers, updateApplicationAccess, deleteApplicationAccessUser,
    fetchPendingUsers, approveUser, rejectUser, updateUserWorkspace,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
    ShieldCheck, UserCheck, UserX, Mail, Clock, Megaphone,
    Warehouse, LayoutGrid, ArrowLeft, Users, ClipboardList,
} from "lucide-react";
import { fmtDateTime } from "@/lib/format";

const roles = [["user", "User / View Only"], ["admin", "Admin"]];
const RoleSelect = ({ value, onChange }) => (
    <select value={value === "admin" ? "admin" : "user"} onChange={e => onChange(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
        {roles.map(([v, l]) => <option value={v} key={v}>{l}</option>)}
    </select>
);

const WORKSPACE_OPTIONS = [
    { value: "marketing", label: "Marketing", icon: Megaphone, color: "from-violet-600 to-indigo-700", bg: "bg-violet-50", text: "text-violet-700" },
    { value: "store", label: "Store", icon: Warehouse, color: "from-cyan-600 to-blue-700", bg: "bg-cyan-50", text: "text-cyan-700" },
    { value: "both", label: "Both", icon: LayoutGrid, color: "from-slate-700 to-slate-900", bg: "bg-slate-100", text: "text-slate-700" },
];

function WorkspacePicker({ selected, onChange }) {
    return (
        <div className="flex gap-2 flex-wrap">
            {WORKSPACE_OPTIONS.map(({ value, label, icon: Icon, bg, text, color }) => (
                <button
                    key={value}
                    type="button"
                    onClick={() => onChange(value)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border-2 transition-all
                        ${selected === value
                            ? `bg-gradient-to-r ${color} text-white border-transparent shadow`
                            : `${bg} ${text} border-transparent hover:border-slate-300`
                        }`}
                >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                </button>
            ))}
        </div>
    );
}

// Derive current workspace from application_access
function getWorkspace(access) {
    const hasMarketing = access?.marketing && access.marketing !== "none";
    const hasStore = access?.store_purchase && access.store_purchase !== "none";
    if (hasMarketing && hasStore) return "both";
    if (hasMarketing) return "marketing";
    if (hasStore) return "store";
    return "both";
}

// ── Pending Approvals Tab ─────────────────────────────────────────────────────
function ApprovalsTab() {
    const qc = useQueryClient();
    const [workspaceMap, setWorkspaceMap] = useState({});

    const { data: pendingUsers = [], isLoading } = useQuery({
        queryKey: ["pending-users"],
        queryFn: fetchPendingUsers,
    });

    const approveMutation = useMutation({
        mutationFn: ({ id, workspace }) => approveUser(id, workspace),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["pending-users"] });
            qc.invalidateQueries({ queryKey: ["application-access-users"] });
        },
    });

    const rejectMutation = useMutation({
        mutationFn: (id) => rejectUser(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-users"] }),
    });

    const handleApprove = async (user) => {
        const workspace = workspaceMap[user.id] || "both";
        try {
            await approveMutation.mutateAsync({ id: user.id, workspace });
            toast.success(`${user.name} approved with ${workspace} workspace access.`);
        } catch (e) { toast.error(e.message); }
    };

    const handleReject = async (user) => {
        try {
            await rejectMutation.mutateAsync(user.id);
            toast.success(`${user.name}'s request was rejected.`);
        } catch (e) { toast.error(e.message); }
    };

    if (isLoading) return <p className="text-sm text-muted-foreground p-4">Loading...</p>;

    if (pendingUsers.length === 0) return (
        <div className="rounded-xl border bg-card p-12 text-center">
            <UserCheck className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No pending registration requests.</p>
        </div>
    );

    return (
        <div className="rounded-xl border bg-card overflow-hidden">
            <div className="divide-y divide-border">
                {pendingUsers.map((user) => (
                    <div key={user.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="font-semibold text-foreground">{user.name}</div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {user.email}</span>
                                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Requested {fmtDateTime(user.created_at)}</span>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleReject(user)}
                                disabled={approveMutation.isPending || rejectMutation.isPending}
                                className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive shrink-0"
                            >
                                <UserX className="h-4 w-4" /> Reject
                            </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="text-xs font-medium text-muted-foreground shrink-0">Workspace:</span>
                            <WorkspacePicker
                                selected={workspaceMap[user.id] || "both"}
                                onChange={(ws) => setWorkspaceMap((prev) => ({ ...prev, [user.id]: ws }))}
                            />
                            <Button
                                size="sm"
                                onClick={() => handleApprove(user)}
                                disabled={approveMutation.isPending || rejectMutation.isPending}
                                className="gap-1.5 ml-auto"
                            >
                                <UserCheck className="h-4 w-4" /> Approve
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Access Management Tab ─────────────────────────────────────────────────────
function AccessTab() {
    const qc = useQueryClient();
    // wsMap persists picker selections in sessionStorage so they survive navigation
    const WS_SESSION_KEY = "access_ws_map";
    const [wsMap, setWsMap] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem(WS_SESSION_KEY) || "{}"); } catch { return {}; }
    });
    const [savedConfirm, setSavedConfirm] = useState({});

    // Sync wsMap to sessionStorage whenever it changes
    const updateWsMap = (updater) => setWsMap((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        try { sessionStorage.setItem(WS_SESSION_KEY, JSON.stringify(next)); } catch {}
        return next;
    });

    const { data: users = [], isLoading } = useQuery({
        queryKey: ["application-access-users"],
        queryFn: fetchApplicationAccessUsers,
    });

    const mutation = useMutation({
        mutationFn: ({ id, body }) => updateApplicationAccess(id, body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["application-access-users"] });
            toast.success("Application access updated.");
        },
        onError: (e) => toast.error(e.message),
    });

    const wsMutation = useMutation({
        mutationFn: ({ id, workspace }) => updateUserWorkspace(id, workspace),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["application-access-users"] });
            toast.success("Workspace access updated.");
        },
        onError: (e) => toast.error(e.message),
    });

    const removeUser = useMutation({
        mutationFn: deleteApplicationAccessUser,
        onSuccess: (result) => {
            qc.invalidateQueries({ queryKey: ["application-access-users"] });
            toast.success(result.message || "User deleted.");
        },
        onError: (e) => toast.error(e.message),
    });

    const changeRole = (user, field, value) =>
        mutation.mutate({
            id: user.id,
            body: {
                marketing: user.application_access?.marketing === "admin" ? "admin" : "user",
                store_purchase: user.application_access?.store_purchase === "admin" ? "admin" : "user",
                is_super_admin: !!user.is_super_admin,
                [field]: value,
            },
        });

    const applyWorkspace = (userId, ws) => {
        wsMutation.mutate(
            { id: userId, workspace: ws },
            {
                onSuccess: () => {
                    // Keep wsMap so picker stays on saved value
                    updateWsMap((prev) => ({ ...prev, [userId]: ws }));
                    // Show "Saved!" briefly then clear
                    setSavedConfirm((prev) => ({ ...prev, [userId]: ws }));
                    setTimeout(() => setSavedConfirm((prev) => { const n={...prev}; delete n[userId]; return n; }), 3000);
                },
            }
        );
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Change workspace access (Marketing / Store / Both) or adjust admin roles per application.
            </p>
            <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="p-3 text-left">User</th>
                            <th className="p-3 text-left">Workspace</th>
                            <th className="p-3 text-left">Marketing Role</th>
                            <th className="p-3 text-left">Store Role</th>
                            <th className="p-3 text-left">Super Admin</th>
                            <th className="p-3 text-center">Delete</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td className="p-4" colSpan="6">Loading…</td></tr>
                        ) : users.map((user) => {
                            // dbWs = what the database currently says for this user
                            const dbWs = getWorkspace(user.application_access);
                            // pickerWs = what the user has selected in the picker
                            // (initialise from DB on first load, then track user clicks)
                            const pickerWs = wsMap[user.id] ?? dbWs;
                            // Changed = picker differs from DB (save button should be active)
                            const hasChange = pickerWs !== dbWs;
                            // Display label uses pickerWs so it shows selected value optimistically
                            const displayWs = wsMap[user.id] || dbWs;
                            return (
                                <tr key={user.id} className="border-t">
                                    <td className="p-3">
                                        <div className="font-medium flex items-center gap-1.5">
                                            {user.name}
                                            {hasChange && (
                                                <span className="rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wide">Unsaved</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground">{user.email}</div>
                                    </td>
                                    <td className="p-3 min-w-[280px]">
                                        <div className="space-y-2">
                                            {/* Current / selected workspace label */}
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <span className="font-medium text-foreground">Current:</span>
                                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                                    displayWs === "both"
                                                        ? "bg-slate-100 text-slate-700"
                                                        : displayWs === "marketing"
                                                            ? "bg-violet-100 text-violet-700"
                                                            : "bg-cyan-100 text-cyan-700"
                                                }`}>
                                                    {displayWs === "both" ? "Marketing + Store"
                                                        : displayWs === "marketing" ? "Marketing Only"
                                                        : "Store Only"}
                                                </span>
                                                {savedConfirm[user.id] && (
                                                    <span className="text-emerald-600 font-bold text-[10px] animate-pulse">✓ Saved!</span>
                                                )}
                                            </div>
                                            {/* Workspace picker pills */}
                                            <WorkspacePicker
                                                selected={pickerWs}
                                                onChange={(ws) => {
                                                    updateWsMap((prev) => ({ ...prev, [user.id]: ws }));
                                                    setSavedConfirm((prev) => { const n={...prev}; delete n[user.id]; return n; });
                                                }}
                                            />
                                            {/* Save button — active when picker differs from DB */}
                                            <Button
                                                size="sm"
                                                variant={hasChange ? "default" : "outline"}
                                                className={`text-xs h-7 w-full transition-colors ${hasChange ? "shadow-sm" : "opacity-60"}`}
                                                disabled={wsMutation.isPending || !hasChange}
                                                onClick={() => applyWorkspace(user.id, pickerWs)}
                                            >
                                                {wsMutation.isPending ? "Saving…" : hasChange ? `Save → ${pickerWs === "both" ? "Marketing + Store" : pickerWs === "marketing" ? "Marketing Only" : "Store Only"}` : "Save Workspace"}
                                            </Button>
                                        </div>
                                    </td>
                                    <td className="p-3">
                                        <RoleSelect
                                            value={user.application_access?.marketing}
                                            onChange={(v) => changeRole(user, "marketing", v)}
                                        />
                                    </td>
                                    <td className="p-3">
                                        <RoleSelect
                                            value={user.application_access?.store_purchase}
                                            onChange={(v) => changeRole(user, "store_purchase", v)}
                                        />
                                    </td>
                                    <td className="p-3 text-center">
                                        <input
                                            type="checkbox"
                                            checked={!!user.is_super_admin}
                                            onChange={(e) => changeRole(user, "is_super_admin", e.target.checked)}
                                            aria-label={`Super Admin for ${user.name}`}
                                        />
                                    </td>
                                    <td className="p-3 text-center">
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            disabled={removeUser.isPending}
                                            onClick={() => {
                                                if (window.confirm(`Delete ${user.name} (${user.email})? Their login, application access and PO approval assignments will be removed.`))
                                                    removeUser.mutate(user.id);
                                            }}
                                        >
                                            Delete
                                        </Button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-muted-foreground">
                Workspace controls which apps a user can access. Role controls read-only vs. admin within that app.
            </p>
        </div>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ApplicationAccessManagement() {
    const [tab, setTab] = useState("approvals");
    const navigate = useNavigate();

    const { data: pendingUsers = [] } = useQuery({
        queryKey: ["pending-users"],
        queryFn: fetchPendingUsers,
    });

    const tabs = [
        { id: "approvals", label: "Approvals", icon: ClipboardList, badge: pendingUsers.length },
        { id: "access", label: "Access Management", icon: Users },
    ];

    return (
        <main className="min-h-screen bg-background">
            {/* Header */}
            <div className="border-b bg-card">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-4 py-4">
                        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5 text-muted-foreground">
                            <ArrowLeft className="h-4 w-4" /> Back
                        </Button>
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="h-6 w-6 text-primary" />
                            <div>
                                <h1 className="text-xl font-bold">Super Admin</h1>
                                <p className="text-xs text-muted-foreground">Manage user approvals and workspace access</p>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 pb-0">
                        {tabs.map(({ id, label, icon: Icon, badge }) => (
                            <button
                                key={id}
                                onClick={() => setTab(id)}
                                className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                                    tab === id
                                        ? "border-primary text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <Icon className="h-4 w-4" />
                                {label}
                                {badge > 0 && (
                                    <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                                        {badge}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
                {tab === "approvals" && <ApprovalsTab />}
                {tab === "access" && <AccessTab />}
            </div>
        </main>
    );
}
