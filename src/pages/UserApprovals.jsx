import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchPendingUsers, approveUser, rejectUser } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { UserCheck, UserX, Mail, Clock, Megaphone, Warehouse, LayoutGrid } from "lucide-react";

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
        const workspace = workspaceMap[user.id] || "both";
        try {
            await approveMutation.mutateAsync({ id: user.id, workspace });
            toast.success(`${user.name} approved with ${workspace} workspace access.`);
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
                                        selected={workspaceMap[user.id] || "both"}
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
