import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hash, Building2, Check, RefreshCw, Shield, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchStorePOSequenceConfig, updateStorePOSequenceConfig } from "@/lib/api";
import { toast } from "sonner";

function defaultFYTag() {
    const now = new Date();
    const calYear = now.getFullYear();
    const fyStart = now.getMonth() >= 3 ? calYear : calYear - 1;
    return `${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}`;
}

export default function StorePOSequenceDialog({ open, onOpenChange, activeCompany = null }) {
    const queryClient = useQueryClient();
    const currentFY = defaultFYTag();

    const { data: configs = [], isLoading } = useQuery({
        queryKey: ["store-po-sequence-config"],
        queryFn: fetchStorePOSequenceConfig,
        enabled: open,
    });

    const [formState, setFormState] = useState({
        "RE-Bar Couplers India Private Limited": { prefix: "STR/0199/", next_number: 33 },
        "JBEC Construction India Private Limited": { prefix: "STR/0199/", next_number: 1 },
    });

    useEffect(() => {
        if (configs && configs.length > 0) {
            const nextMap = { ...formState };
            for (const c of configs) {
                if (c.company) {
                    nextMap[c.company] = {
                        prefix: c.prefix || "STR/0199/",
                        next_number: c.next_number || 1,
                        updated_by: c.updated_by,
                        updated_at: c.updated_at,
                    };
                }
            }
            setFormState(nextMap);
        }
    }, [configs]);

    const mutation = useMutation({
        mutationFn: updateStorePOSequenceConfig,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["store-po-sequence-config"] });
            queryClient.invalidateQueries({ queryKey: ["store-orders"] });
            toast.success(`Starting PO number updated for "${data.company}". Next PO will be ${data.prefix}${String(data.next_number).padStart(2, "0")}-${currentFY}`);
        },
        onError: (err) => {
            toast.error(err.message || "Failed to update PO sequence.");
        },
    });

    const handleSave = (company) => {
        const item = formState[company];
        if (!item) return;
        const num = parseInt(item.next_number, 10);
        if (isNaN(num) || num < 1) {
            return toast.error("Starting sequence number must be 1 or higher.");
        }
        mutation.mutate({
            company,
            prefix: item.prefix.trim() || "STR/0199/",
            next_number: num,
        });
    };

    const companies = [
        {
            key: "RE-Bar Couplers India Private Limited",
            name: "RE-Bar Couplers India Private Limited",
            short: "RE-Bar",
            desc: "Setup from which number RE-Bar POs should start.",
        },
        {
            key: "JBEC Construction India Private Limited",
            name: "JBEC Construction India Private Limited",
            short: "JBEC",
            desc: "Setup from which number JBEC Construction POs should start.",
        },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl p-6 sm:p-7">
                <DialogHeader className="border-b pb-4">
                    <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-100 text-cyan-800">
                            <Hash className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <DialogTitle className="text-xl font-bold text-slate-900">
                                    PO Number Setup
                                </DialogTitle>
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 border border-amber-200">
                                    <Shield className="h-3 w-3 text-amber-700" /> Super Admin
                                </span>
                            </div>
                            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                Set where each company's PO sequence starts. Subsequent POs will automatically increment (+1) from that number.
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="mt-4 space-y-5">
                    {companies.map((comp) => {
                        const cur = formState[comp.key] || { prefix: "STR/0199/", next_number: 1 };
                        const numStr = String(cur.next_number || 1).padStart(2, "0");
                        const preview = `${cur.prefix || "STR/0199/"}${numStr}-${currentFY}`;
                        const isTargetCompany = activeCompany === comp.key;

                        return (
                            <div
                                key={comp.key}
                                className={`rounded-xl border p-4 transition-all ${
                                    isTargetCompany
                                        ? "border-cyan-400 bg-cyan-50/40 ring-1 ring-cyan-200"
                                        : "border-slate-200 bg-slate-50/50"
                                }`}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                                    <div className="flex items-center gap-2">
                                        <Building2 className="h-4 w-4 text-cyan-700 shrink-0" />
                                        <h3 className="text-sm font-bold text-slate-900">{comp.name}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] text-muted-foreground">Next PO Preview:</span>
                                        <span className="rounded bg-white border border-slate-300 px-2 py-0.5 text-xs font-mono font-bold text-cyan-900 shadow-2xs">
                                            {preview}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-3.5 grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs font-semibold text-slate-700">
                                            Prefix Format
                                        </Label>
                                        <Input
                                            value={cur.prefix}
                                            onChange={(e) =>
                                                setFormState((prev) => ({
                                                    ...prev,
                                                    [comp.key]: {
                                                        ...prev[comp.key],
                                                        prefix: e.target.value,
                                                    },
                                                }))
                                            }
                                            placeholder="e.g. STR/0199/"
                                            className="bg-white h-9 text-xs font-mono"
                                        />
                                        <p className="text-[10px] text-slate-400">Fixed prefix before series count</p>
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-xs font-semibold text-slate-700">
                                            Next PO Number (Starting From) *
                                        </Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={cur.next_number}
                                            onChange={(e) =>
                                                setFormState((prev) => ({
                                                    ...prev,
                                                    [comp.key]: {
                                                        ...prev[comp.key],
                                                        next_number: e.target.value,
                                                    },
                                                }))
                                            }
                                            placeholder="e.g. 1, 33, 50, 101"
                                            className="bg-white h-9 text-xs font-bold text-cyan-900"
                                        />
                                        <p className="text-[10px] text-slate-400">
                                            Agla banne wala PO ye number lega, fr +1 auto badhega.
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-3.5 flex items-center justify-between pt-2 border-t border-slate-200/60">
                                    <span className="text-[10px] text-slate-400 italic">
                                        {cur.updated_by ? `Last updated by ${cur.updated_by}` : "Default system sequence"}
                                    </span>
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={mutation.isPending}
                                        onClick={() => handleSave(comp.key)}
                                        className="h-8 bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-xs"
                                    >
                                        <Check className="mr-1 h-3.5 w-3.5" /> Save {comp.short} Setup
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-5 flex items-center justify-between border-t pt-4">
                    <p className="text-[11px] text-slate-500">
                        💡 Setup karne ke baad naye POs issi number se shuru honge aur automatically increment honge.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                        Done
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
