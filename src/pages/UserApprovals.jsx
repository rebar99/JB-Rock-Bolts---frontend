import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchPendingUsers, approveUser, rejectUser } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { UserCheck, UserX, Mail, Clock } from "lucide-react";

const UserApprovals = () => {
    const qc = useQueryClient();

    const { data: pendingUsers = [], isLoading } = useQuery({
        queryKey: ["pending-users"],
        queryFn: fetchPendingUsers,
    });

    const approveMutation = useMutation({
        mutationFn: (id) => approveUser(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-users"] }),
    });

    const rejectMutation = useMutation({
        mutationFn: (id) => rejectUser(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-users"] }),
    });

    const handleApprove = async (user) => {
        try {
            await approveMutation.mutateAsync(user.id);
            toast.success(`${user.name} approved — they can now log in.`);
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
                    Review new registrations and approve them to grant login access.
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
                            <div key={user.id} className="flex items-center justify-between gap-4 p-4">
                                <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-foreground truncate">{user.name}</div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Mail className="h-3 w-3" /> {user.email}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" /> Requested {fmtDateTime(user.created_at)}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => handleReject(user)}
                                        disabled={approveMutation.isPending || rejectMutation.isPending}
                                        className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                                    >
                                        <UserX className="h-4 w-4" />
                                        Reject
                                    </Button>
                                    <Button
                                        onClick={() => handleApprove(user)}
                                        disabled={approveMutation.isPending || rejectMutation.isPending}
                                        className="gap-2"
                                    >
                                        <UserCheck className="h-4 w-4" />
                                        Approve
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
