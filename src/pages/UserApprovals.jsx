import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchPendingUsers, approveUser, rejectUser } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { UserCheck, UserX, Mail, Clock, Megaphone, Warehouse, LayoutGrid, Landmark, Users } from "lucide-react";

const INDIVIDUAL_WORKSPACES = [
    { value: "marketing", label: "Marketing", icon: Megaphone, color: "from-violet-600 to-indigo-700", bg: "bg-violet-50", text: "text-violet-700" },
    { value: "store", label: "Store", icon: Warehouse, color: "from-cyan-600 to-blue-700", bg: "bg-cyan-50", text: "text-cyan-700" },
    { value: "accounts", label: "Accounts", icon: Landmark, color: "from-emerald-600 to-teal-700", bg: "bg-emerald-50", text: "text-emerald-700" },
    { value: "hr", label: "HR", icon: Users, color: "from-blue-600 to-indigo-800", bg: "bg-blue-50", text: "text-blue-700" },
];

function parseWorkspaceValue(val) {
    if (!val) return new Set(["marketing", "store", "accounts", "hr"]);
    if (val instanceof Set) return new Set(val);
    if (Array.isArray(val)) return new Set(val);
    const raw = String(val).toLowerCase().trim();
    if (raw === "all" || raw === "both") {
        return new Set(["marketing", "store", "accounts", "hr"]);
    }
    const parts = raw.split(/[,+]/).map(s => s.trim()).filter(Boolean);
    return new Set(parts);
}

function normalizeWs(val) {
    const s = parseWorkspaceValue(val);
    const list = ["marketing", "store", "accounts", "hr"].filter(w => s.has(w));
    return list.length === 4 ? "all" : list.join(",");
}

function getWorkspaceLabel(val) {
    const set = parseWorkspaceValue(val);
    const names = [];
    if (set.has("marketing")) names.push("Marketing");
    if (set.has("store")) names.push("Store");
    if (set.has("accounts")) names.push("Accounts");
    if (set.has("hr")) names.push("HR");
    if (names.length === 4) return "All Workspaces (Marketing + Store + Accounts + HR)";
    if (names.length === 0) return "No Access";
    return names.join(" + ");
}

function WorkspacePicker({ selected, onChange }) {
    const currentSet = parseWorkspaceValue(selected);
    const isAll = currentSet.size === 4;

    const toggle = (val) => {
        const next = new Set(currentSet);
        if (next.has(val)) {
            if (next.size > 1) {
                next.delete(val);
            } else {
                toast.error("At least one workspace must remain selected.");
                return;
            }
        } else {
            next.add(val);
        }
        onChange(normalizeWs(next));
    };

    const toggleAll = () => {
        if (isAll) {
            onChange("marketing");
        } else {
            onChange("all");
        }
    };

    return (
        <div className="flex gap-1.5 flex-wrap items-center">
            {INDIVIDUAL_WORKSPACES.map(({ value, label, icon: Icon, bg, text, color }) => {
                const isSelected = currentSet.has(value);
                return (
                    <button
                        key={value}
                        type="button"
                        onClick={() => toggle(value)}
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border transition-all ${
                            isSelected
                                ? `bg-gradient-to-r ${color} text-white border-transparent shadow-sm ring-2 ring-offset-1 ring-cyan-500`
                                : `${bg} ${text} border-slate-200 opacity-60 hover:opacity-100 hover:border-slate-300`
                        }`}
                        title={isSelected ? `Click to remove ${label}` : `Click to add ${label}`}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                        {isSelected && <span className="ml-0.5 text-[10px] font-bold">✓</span>}
                    </button>
                );
            })}
            <button
                type="button"
                onClick={toggleAll}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border transition-all ${
                    isAll
                        ? "bg-slate-900 text-white border-slate-900 shadow-sm ring-2 ring-offset-1 ring-slate-800"
                        : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                }`}
                title={isAll ? "Deselect all (reset to Marketing)" : "Select all 4 workspaces"}
            >
                <LayoutGrid className="h-3.5 w-3.5" />
                {isAll ? "All Workspaces ✓" : "All Workspaces"}
            </button>
        </div>
    );
}

const UserApprovals = () => {
    const qc = useQueryClient();
    const [workspaceMap, setWorkspaceMap] = useState({}); // { userId: workspace }

    const { data: pendingUsers = [], isLoading } = useQuery({
        queryKey: ["pending-users"],
        queryFn: fetchPendingUsers,
    });

    const approveMutation = useMutation({
        mutationFn: ({ id, workspace }) => approveUser(id, workspace),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-users"] }),
    });

    const rejectMutation = useMutation({
        mutationFn: (id) => rejectUser(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-users"] }),
    });

    const handleApprove = async (user) => {
        const workspace = normalizeWs(workspaceMap[user.id] || "all");
        try {
            await approveMutation.mutateAsync({ id: user.id, workspace });
            toast.success(`${user.name} approved with ${getWorkspaceLabel(workspace)}.`);
        } catch (e) {
            toast.error(e.message);
        }
    };

    const handleReject = async (user) => {
        try {
            await rejectMutation.mutateAsync(user.id);
            toast.success(`${user.name}'s request was rejected.`);
        } catch (e) {
            toast.error(e.message);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">User Approvals</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Review new registrations. Select a workspace access before approving.
                </p>
            </div>

            {isLoading && <p className="text-muted-foreground text-sm">Loading requests...</p>}

            {!isLoading && pendingUsers.length === 0 && (
                <Card className="p-12 text-center shadow-card">
                    <p className="text-muted-foreground">No pending registration requests.</p>
                </Card>
            )}

            {pendingUsers.length > 0 && (
                <Card className="shadow-card overflow-hidden">
                    <div className="divide-y divide-border">
                        {pendingUsers.map((user) => (
                            <div key={user.id} className="p-4 space-y-3">
                                {/* User info */}
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-foreground">{user.name}</div>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {user.email}</span>
                                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Requested {fmtDateTime(user.created_at)}</span>
                                        </div>
                                    </div>
                                    {/* Reject button */}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleReject(user)}
                                        disabled={approveMutation.isPending || rejectMutation.isPending}
                                        className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive shrink-0"
                                    >
                                        <UserX className="h-4 w-4" /> Reject
                                    </Button>
                                </div>

                                {/* Workspace picker + Approve */}
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-xs font-medium text-muted-foreground shrink-0">Workspace:</span>
                                    <WorkspacePicker
                                        selected={workspaceMap[user.id] || "all"}
                                        onChange={(ws) => setWorkspaceMap((prev) => ({ ...prev, [user.id]: ws }))}
                                    />
                                    <Button
                                        size="sm"
                                        onClick={() => handleApprove(user)}
                                        disabled={approveMutation.isPending || rejectMutation.isPending}
                                        className="gap-2 ml-auto"
                                    >
                                        <UserCheck className="h-4 w-4" /> Approve
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default UserApprovals;
