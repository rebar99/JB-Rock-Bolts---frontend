import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Ruler, CheckCircle2, XCircle, Search, Power, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchUnitConversionConfig, updateUnitConversionConfig } from "@/lib/api";
import { toast } from "sonner";

export default function ManualUnitConversionDialog({ open, onOpenChange }) {
    const queryClient = useQueryClient();
    const [selectedGroup, setSelectedGroup] = useState("");
    const [customGroup, setCustomGroup] = useState("");
    const [isEnabled, setIsEnabled] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterTab, setFilterTab] = useState("all"); // "all" | "enabled" | "disabled"

    const { data = {}, isLoading } = useQuery({
        queryKey: ["unit-conversion-config"],
        queryFn: fetchUnitConversionConfig,
        enabled: open,
    });

    const configs = data.configs || [];
    const availableGroups = data.available_groups || [];
    const enabledGroups = data.enabled_groups || [];

    const saveMutation = useMutation({
        mutationFn: updateUnitConversionConfig,
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ["unit-conversion-config"] });
            queryClient.invalidateQueries({ queryKey: ["store-orders"] });
            queryClient.invalidateQueries({ queryKey: ["store-material-receipts"] });
            toast.success(`Manual Meter Entry ${res.is_enabled ? "ENABLED" : "DISABLED"} for '${res.group_name}'.`);
            setSelectedGroup("");
            setCustomGroup("");
        },
        onError: (err) => toast.error(err.message || "Failed to update configuration"),
    });

    const handleSave = (e) => {
        e?.preventDefault();
        const groupName = (selectedGroup === "__custom__" ? customGroup : selectedGroup).trim();
        if (!groupName) {
            toast.error("Please select or enter a Group Name.");
            return;
        }
        saveMutation.mutate({
            group_name: groupName,
            is_enabled: isEnabled,
            conversion_unit: "Meter",
        });
    };

    const handleQuickToggle = (config) => {
        saveMutation.mutate({
            group_name: config.group_name,
            is_enabled: !config.is_enabled,
            conversion_unit: config.conversion_unit || "Meter",
        });
    };

    // Build complete list of groups with their active status
    const allGroupsDisplay = useMemo(() => {
        const configMap = new Map();
        configs.forEach((c) => configMap.set(c.group_name.trim().toLowerCase(), c));

        const list = [];
        const seen = new Set();

        // First add all configured rows
        configs.forEach((c) => {
            const key = c.group_name.trim().toLowerCase();
            seen.add(key);
            list.push({
                group_name: c.group_name,
                is_enabled: c.is_enabled,
                conversion_unit: c.conversion_unit || "Meter",
                updated_by: c.updated_by,
                updated_at: c.updated_at,
                has_record: true,
            });
        });

        // Next add available master groups that haven't been explicitly configured yet (default OFF)
        availableGroups.forEach((g) => {
            const key = g.trim().toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                list.push({
                    group_name: g,
                    is_enabled: false,
                    conversion_unit: "Meter",
                    updated_by: null,
                    updated_at: null,
                    has_record: false,
                });
            }
        });

        return list.sort((a, b) => {
            if (a.is_enabled !== b.is_enabled) return a.is_enabled ? -1 : 1;
            return a.group_name.localeCompare(b.group_name);
        });
    }, [configs, availableGroups]);

    const filteredGroups = useMemo(() => {
        return allGroupsDisplay.filter((g) => {
            const matchesSearch = !searchTerm || g.group_name.toLowerCase().includes(searchTerm.toLowerCase());
            if (!matchesSearch) return false;
            if (filterTab === "enabled") return g.is_enabled;
            if (filterTab === "disabled") return !g.is_enabled;
            return true;
        });
    }, [allGroupsDisplay, searchTerm, filterTab]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
                <DialogHeader className="border-b pb-4">
                    <div className="flex items-center gap-2.5 text-amber-700">
                        <ShieldCheck className="h-6 w-6 text-amber-600" />
                        <div>
                            <DialogTitle className="text-xl font-bold text-slate-900">
                                Manual Unit Conversion Configuration
                            </DialogTitle>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full inline-block mt-0.5">
                                Super Admin Control
                            </span>
                        </div>
                    </div>
                    <DialogDescription className="text-xs text-slate-600 mt-2">
                        Configure which Group Names allow <strong>Manual Meter Entry</strong> in Materials Received. When enabled for a group, items under that group allow entering actual received Kg and manually entering actual Meter quantity for Inventory.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-5 pr-1 py-3">
                    {/* Configuration Form */}
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs space-y-4">
                        <div className="flex items-center gap-2">
                            <Ruler className="h-4 w-4 text-amber-800" />
                            <h3 className="text-sm font-bold text-amber-950">Add or Update Group Setting</h3>
                        </div>

                        <form onSubmit={handleSave} className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                                <div className="sm:col-span-6">
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Select Group Name
                                    </label>
                                    <select
                                        value={selectedGroup}
                                        onChange={(e) => setSelectedGroup(e.target.value)}
                                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-800 shadow-2xs focus:border-cyan-500 focus:outline-none"
                                    >
                                        <option value="">-- Choose a Group Name --</option>
                                        {availableGroups.map((g) => {
                                            const isCurrentlyOn = enabledGroups.includes(g.trim().toLowerCase());
                                            return (
                                                <option key={g} value={g}>
                                                    {g} {isCurrentlyOn ? "(Currently ON)" : ""}
                                                </option>
                                            );
                                        })}
                                        <option value="__custom__">+ Enter Custom Group Name</option>
                                    </select>
                                </div>

                                <div className="sm:col-span-3">
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Functionality
                                    </label>
                                    <div className="flex rounded-md border border-slate-300 bg-white p-0.5">
                                        <button
                                            type="button"
                                            onClick={() => setIsEnabled(true)}
                                            className={`flex-1 rounded py-1 text-xs font-bold transition ${
                                                isEnabled
                                                    ? "bg-emerald-600 text-white shadow-xs"
                                                    : "text-slate-600 hover:text-slate-900"
                                            }`}
                                        >
                                            ON
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsEnabled(false)}
                                            className={`flex-1 rounded py-1 text-xs font-bold transition ${
                                                !isEnabled
                                                    ? "bg-slate-700 text-white shadow-xs"
                                                    : "text-slate-600 hover:text-slate-900"
                                            }`}
                                        >
                                            OFF
                                        </button>
                                    </div>
                                </div>

                                <div className="sm:col-span-3">
                                    <Button
                                        type="submit"
                                        disabled={saveMutation.isPending || !selectedGroup}
                                        className="w-full h-9 text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                                    >
                                        {saveMutation.isPending ? "Saving..." : "Save Setting"}
                                    </Button>
                                </div>
                            </div>

                            {selectedGroup === "__custom__" && (
                                <div className="pt-1">
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Custom Group Name
                                    </label>
                                    <Input
                                        placeholder="e.g. Round Black, Structural Steel, MS Plate..."
                                        value={customGroup}
                                        onChange={(e) => setCustomGroup(e.target.value)}
                                        className="h-8 text-xs bg-white"
                                    />
                                </div>
                            )}

                            <p className="text-[11px] text-slate-500">
                                Target Stock Unit for this conversion is <strong>Meter</strong>. Default setting for unconfigured groups is <strong>OFF</strong>.
                            </p>
                        </form>
                    </div>

                    {/* Group Settings List */}
                    <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-800">Configured Groups</span>
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                                    {allGroupsDisplay.filter((g) => g.is_enabled).length} Enabled
                                </span>
                            </div>

                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <div className="flex rounded-md border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-medium">
                                    <button
                                        type="button"
                                        onClick={() => setFilterTab("all")}
                                        className={`px-2 py-0.5 rounded ${filterTab === "all" ? "bg-white font-bold text-slate-900 shadow-2xs" : "text-slate-600"}`}
                                    >
                                        All ({allGroupsDisplay.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterTab("enabled")}
                                        className={`px-2 py-0.5 rounded ${filterTab === "enabled" ? "bg-white font-bold text-emerald-700 shadow-2xs" : "text-slate-600"}`}
                                    >
                                        ON ({allGroupsDisplay.filter((g) => g.is_enabled).length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterTab("disabled")}
                                        className={`px-2 py-0.5 rounded ${filterTab === "disabled" ? "bg-white font-bold text-slate-700 shadow-2xs" : "text-slate-600"}`}
                                    >
                                        OFF ({allGroupsDisplay.filter((g) => !g.is_enabled).length})
                                    </button>
                                </div>

                                <div className="relative w-36 sm:w-44">
                                    <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
                                    <Input
                                        placeholder="Search group..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="h-8 pl-7 text-xs bg-white"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                            <div className="max-h-64 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 border-b text-slate-600 font-semibold sticky top-0 z-10">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Group Name</th>
                                            <th className="px-3 py-2 text-center">Status</th>
                                            <th className="px-3 py-2 text-center">Target Stock Unit</th>
                                            <th className="px-3 py-2 text-right">Quick Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan="4" className="p-6 text-center text-slate-400">
                                                    Loading configurations...
                                                </td>
                                            </tr>
                                        ) : filteredGroups.length === 0 ? (
                                            <tr>
                                                <td colSpan="4" className="p-6 text-center text-slate-400">
                                                    No groups found matching filter.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredGroups.map((g) => (
                                                <tr key={g.group_name} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="px-3 py-2.5 font-medium text-slate-900">
                                                        <div className="flex items-center gap-1.5">
                                                            {g.is_enabled ? (
                                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                                            ) : (
                                                                <XCircle className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                                                            )}
                                                            <span>{g.group_name}</span>
                                                        </div>
                                                        {g.updated_by && (
                                                            <div className="text-[10px] text-slate-400 pl-5">
                                                                Updated by {g.updated_by}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-center">
                                                        {g.is_enabled ? (
                                                            <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                                                ON (Meter)
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                                                OFF
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-center font-medium text-slate-600">
                                                        {g.conversion_unit || "Meter"}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant={g.is_enabled ? "outline" : "default"}
                                                            disabled={saveMutation.isPending}
                                                            onClick={() => handleQuickToggle(g)}
                                                            className={`h-7 px-2.5 text-[11px] font-semibold ${
                                                                g.is_enabled
                                                                    ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                                                                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                                            }`}
                                                        >
                                                            <Power className="mr-1 h-3 w-3" />
                                                            {g.is_enabled ? "Turn OFF" : "Turn ON"}
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="border-t pt-3 flex justify-between items-center sm:justify-end">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
