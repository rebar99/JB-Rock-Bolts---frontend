import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, UserCheck, UserX, Clock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    fetchDataVerificationEligibleUsers,
    fetchDataVerificationPermissions,
    grantDataVerificationPermission,
    revokeDataVerificationPermission,
    fetchDataVerificationHistory,
} from "@/lib/api";

const fmtDt = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

export default function DataVerificationSettings() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [search, setSearch] = useState("");

    const { data: users = [], isLoading: loadingUsers } = useQuery({
        queryKey: ["dv-eligible-users"],
        queryFn: fetchDataVerificationEligibleUsers,
    });

    const { data: history = [], isLoading: loadingHistory } = useQuery({
        queryKey: ["dv-history"],
        queryFn: fetchDataVerificationHistory,
    });

    const grant = useMutation({
        mutationFn: (userId) => grantDataVerificationPermission(userId),
        onSuccess: (_, userId) => {
            qc.invalidateQueries({ queryKey: ["dv-eligible-users"] });
            toast.success("Permission granted.");
        },
        onError: (e) => toast.error(e.message),
    });

    const revoke = useMutation({
        mutationFn: (userId) => revokeDataVerificationPermission(userId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["dv-eligible-users"] });
            toast.success("Permission revoked.");
        },
        onError: (e) => toast.error(e.message),
    });

    const filtered = users.filter(
        (u) =>
            u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase())
    );

    const grantedUsers = filtered.filter((u) => u.has_permission);
    const otherUsers = filtered.filter((u) => !u.has_permission && !u.is_super_admin);

    return (
        <main className="mx-auto max-w-5xl space-y-8 p-5 sm:p-8">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(-1)}
                    className="gap-1.5 text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <div>
                    <h1 className="text-2xl font-extrabold flex items-center gap-2">
                        <ShieldCheck className="h-6 w-6 text-[#8B0000]" />
                        Data Verification Access
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Select which users can verify Marketing Report data. Verification is valid for 7 days.
                    </p>
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search users…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                />
            </div>

            {/* Users with permission */}
            <Card className="p-5 shadow-sm border-border/60">
                <h2 className="text-base font-bold mb-4 flex items-center gap-2 text-green-700">
                    <UserCheck className="h-5 w-5" />
                    Users With Verification Permission ({grantedUsers.length})
                </h2>
                {loadingUsers ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                ) : grantedUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                        No users have verification permission yet.
                    </p>
                ) : (
                    <div className="divide-y divide-border/60">
                        {grantedUsers.map((u) => (
                            <div key={u.id} className="flex items-center justify-between py-3">
                                <div>
                                    <p className="font-semibold text-sm">{u.name}</p>
                                    <p className="text-xs text-muted-foreground">{u.email}</p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive border-red-200 hover:bg-red-50 hover:text-red-800 gap-1.5"
                                    disabled={revoke.isPending}
                                    onClick={() => {
                                        if (window.confirm(`Revoke verification access from ${u.name}?`))
                                            revoke.mutate(u.id);
                                    }}
                                >
                                    <UserX className="h-3.5 w-3.5" />
                                    Revoke
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* Users without permission */}
            <Card className="p-5 shadow-sm border-border/60">
                <h2 className="text-base font-bold mb-4 flex items-center gap-2 text-slate-700">
                    <UserX className="h-5 w-5" />
                    Other Users (No Permission) ({otherUsers.length})
                </h2>
                {loadingUsers ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                ) : otherUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">All users have permission.</p>
                ) : (
                    <div className="divide-y divide-border/60">
                        {otherUsers.map((u) => (
                            <div key={u.id} className="flex items-center justify-between py-3">
                                <div>
                                    <p className="font-semibold text-sm">{u.name}</p>
                                    <p className="text-xs text-muted-foreground">{u.email}</p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800 gap-1.5"
                                    disabled={grant.isPending}
                                    onClick={() => grant.mutate(u.id)}
                                >
                                    <UserCheck className="h-3.5 w-3.5" />
                                    Grant Access
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* History */}
            <Card className="p-5 shadow-sm border-border/60">
                <h2 className="text-base font-bold mb-4 flex items-center gap-2 text-slate-700">
                    <Clock className="h-5 w-5" />
                    Verification History
                </h2>
                {loadingHistory ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                ) : history.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No verifications yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b text-left text-xs font-semibold uppercase text-slate-600">
                                <tr>
                                    <th className="py-2.5 px-3">S.No.</th>
                                    <th className="py-2.5 px-3">Verified By</th>
                                    <th className="py-2.5 px-3">Verified On</th>
                                    <th className="py-2.5 px-3">Valid Until</th>
                                    <th className="py-2.5 px-3">Status</th>
                                    <th className="py-2.5 px-3">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                                {history.map((r, i) => (
                                    <tr key={r.id} className="hover:bg-slate-50/60">
                                        <td className="py-2.5 px-3 text-muted-foreground">{i + 1}</td>
                                        <td className="py-2.5 px-3 font-medium">{r.verified_by}</td>
                                        <td className="py-2.5 px-3">{fmtDt(r.verified_at)}</td>
                                        <td className="py-2.5 px-3">{fmtDt(r.expires_at)}</td>
                                        <td className="py-2.5 px-3">
                                            <span
                                                className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                                                    r.status === "Active"
                                                        ? "bg-green-100 text-green-700"
                                                        : r.status === "Expired"
                                                        ? "bg-orange-100 text-orange-700"
                                                        : "bg-slate-100 text-slate-500"
                                                }`}
                                            >
                                                {r.status}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-3 text-muted-foreground">{r.notes || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </main>
    );
}
