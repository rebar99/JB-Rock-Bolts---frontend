/**
 * DataVerificationBadge
 * ─────────────────────
 * Shows the current verification status of Marketing Report data.
 * - Any logged-in user: sees status badge + verified-by + dates
 * - Authorized verifiers: see "Verify Now" button
 * - Super Admin: also sees link to permission settings
 *
 * Place this near the top of the Marketing Reports page.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
    ShieldCheck, ShieldAlert, ShieldX, Clock, Settings, RefreshCw, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchDataVerificationStatus, verifyData, fetchDataVerificationHistory } from "@/lib/api";

const fmtDate = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtDt = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const STATUS_CONFIG = {
    Verified: {
        icon: ShieldCheck,
        bg: "bg-green-50 border-green-200",
        iconCls: "text-green-600",
        badge: "bg-green-100 text-green-700",
        label: "Verified",
    },
    "Pending Verification": {
        icon: ShieldAlert,
        bg: "bg-orange-50 border-orange-200",
        iconCls: "text-orange-500",
        badge: "bg-orange-100 text-orange-700",
        label: "Pending Verification",
    },
    Expired: {
        icon: ShieldX,
        bg: "bg-red-50 border-red-200",
        iconCls: "text-red-500",
        badge: "bg-red-100 text-red-700",
        label: "Expired",
    },
};

export default function DataVerificationBadge() {
    const qc = useQueryClient();
    const [historyOpen, setHistoryOpen] = useState(false);
    const [notes, setNotes] = useState("");
    const [verifyOpen, setVerifyOpen] = useState(false);
    const [alreadyVerifiedOpen, setAlreadyVerifiedOpen] = useState(false);

    const { data: status, isLoading } = useQuery({
        queryKey: ["dv-status"],
        queryFn: fetchDataVerificationStatus,
        refetchInterval: 60_000, // re-check every 60s
    });

    const { data: history = [], isLoading: loadingHistory } = useQuery({
        queryKey: ["dv-history"],
        queryFn: fetchDataVerificationHistory,
        enabled: historyOpen,
    });

    const verify = useMutation({
        mutationFn: () => verifyData(notes),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["dv-status"] });
            qc.invalidateQueries({ queryKey: ["dv-history"] });
            toast.success("✅ Data verified successfully! Valid for 7 days.");
            setVerifyOpen(false);
            setNotes("");
        },
        onError: (e) => toast.error(e.message),
    });

    if (isLoading) return null;

    const st = status?.status ?? "Pending Verification";
    const cfg = STATUS_CONFIG[st] || STATUS_CONFIG["Pending Verification"];
    const Icon = cfg.icon;
    const canVerify = status?.can_verify;
    const isSuperAdmin = status?.is_super_admin;

    const handleVerifyClick = () => {
        if (st === "Verified") {
            const nextDate = fmtDate(status?.next_verification_date);
            toast.warning(
                `Data is already verified. Re-verification can only be done after 7 days (Next verification: ${nextDate}).`
            );
            setAlreadyVerifiedOpen(true);
            return;
        }
        setVerifyOpen(true);
    };

    return (
        <>
            <Card className={`flex flex-wrap items-center gap-4 px-4 py-3 border ${cfg.bg} shadow-sm`}>
                {/* Icon + Status Badge */}
                <div className="flex items-center gap-2 shrink-0">
                    <Icon className={`h-5 w-5 ${cfg.iconCls}`} />
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
                        {cfg.label}
                    </span>
                </div>

                {/* Details - only show "not verified" text when unverified */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600 flex-1">
                    {!status?.verified_by && (
                        <span className="text-slate-500 italic">
                            Data has not been verified yet.
                        </span>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0 ml-auto">
                    {/* History */}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-slate-600 hover:text-slate-900 text-xs"
                        onClick={() => setHistoryOpen(true)}
                    >
                        <History className="h-3.5 w-3.5" />
                        History
                    </Button>

                    {/* Super Admin → Settings link */}
                    {isSuperAdmin && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-slate-600 hover:text-slate-900 text-xs"
                            asChild
                        >
                            <Link to="/admin/data-verification-settings">
                                <Settings className="h-3.5 w-3.5" />
                                Manage Access
                            </Link>
                        </Button>
                    )}

                    {/* Verify button for authorized users */}
                    {canVerify && (
                        <Button
                            size="sm"
                            className="h-8 gap-1.5 bg-[#8B0000] hover:bg-[#6b0000] text-white text-xs"
                            onClick={handleVerifyClick}
                        >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {st === "Verified" ? "Re-Verify" : "Verify Data"}
                        </Button>
                    )}
                </div>
            </Card>

            {/* Already Verified Notice Dialog */}
            <Dialog open={alreadyVerifiedOpen} onOpenChange={setAlreadyVerifiedOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-700">
                            <Clock className="h-5 w-5 text-amber-600" />
                            Data Already Verified
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 space-y-2">
                            <p className="font-semibold text-base text-amber-800">
                                Re-verification not required yet
                            </p>
                            <p>
                                Marketing Report data was verified by{" "}
                                <strong>{status?.verified_by || "Authorized User"}</strong> on{" "}
                                <strong>{fmtDate(status?.verified_date)}</strong>.
                            </p>
                            <p>
                                Re-verification can only be done after <strong>7 days</strong> (on or after{" "}
                                <strong>{fmtDate(status?.next_verification_date)}</strong>).
                            </p>
                        </div>
                        <div className="flex justify-end pt-1">
                            <Button
                                className="bg-[#8B0000] hover:bg-[#6b0000] text-white"
                                onClick={() => setAlreadyVerifiedOpen(false)}
                            >
                                Understood
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Verify Dialog */}
            <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-green-600" />
                            Verify Marketing Report Data
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <p className="text-sm text-muted-foreground">
                            By verifying, you confirm that the Marketing Report data has been reviewed
                            and is accurate. This verification will be valid for{" "}
                            <strong>7 days</strong>.
                        </p>
                        <div>
                            <label className="text-sm font-medium text-slate-700">
                                Notes <span className="text-muted-foreground font-normal">(optional)</span>
                            </label>
                            <textarea
                                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                rows={3}
                                placeholder="Add any verification notes…"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={() => setVerifyOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                className="bg-green-700 hover:bg-green-800 text-white gap-1.5"
                                disabled={verify.isPending}
                                onClick={() => verify.mutate()}
                            >
                                {verify.isPending ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                    <ShieldCheck className="h-4 w-4" />
                                )}
                                Confirm Verification
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* History Dialog */}
            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <History className="h-5 w-5 text-slate-600" />
                            Verification History – Marketing Report
                        </DialogTitle>
                    </DialogHeader>
                    {loadingHistory ? (
                        <p className="text-sm py-4 text-center text-muted-foreground">Loading history…</p>
                    ) : history.length === 0 ? (
                        <p className="text-sm py-4 text-center text-muted-foreground italic">
                            No verification records yet.
                        </p>
                    ) : (
                        <div className="overflow-x-auto mt-2">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b text-xs font-semibold uppercase text-slate-600">
                                    <tr>
                                        <th className="py-2.5 px-3 text-left">S.No.</th>
                                        <th className="py-2.5 px-3 text-left">Verified By</th>
                                        <th className="py-2.5 px-3 text-left">Verified On</th>
                                        <th className="py-2.5 px-3 text-left">Valid Until</th>
                                        <th className="py-2.5 px-3 text-left">Status</th>
                                        <th className="py-2.5 px-3 text-left">Notes</th>
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
                </DialogContent>
            </Dialog>
        </>
    );
}
