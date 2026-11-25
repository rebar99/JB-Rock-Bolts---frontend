import { useState, useEffect } from "react";
import { Ruler, Check, AlertCircle, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ManualMeterEntryModal({ open, onOpenChange, line, onSave }) {
    const [meterValue, setMeterValue] = useState("");

    useEffect(() => {
        if (open && line) {
            setMeterValue(
                line.manual_meter_quantity != null && line.manual_meter_quantity !== ""
                    ? String(line.manual_meter_quantity)
                    : ""
            );
        }
    }, [open, line]);

    if (!line) return null;

    const handleSave = (e) => {
        e?.preventDefault();
        const val = meterValue.trim();
        if (!val || isNaN(Number(val)) || Number(val) <= 0) {
            onSave(null);
            onOpenChange(false);
            return;
        }
        onSave(Number(val));
        onOpenChange(false);
    };

    const handleClear = () => {
        onSave(null);
        onOpenChange(false);
    };

    const receivedQty = Number(line.received_quantity || 0);
    const uom = line.uom || "Kg";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md p-6">
                <DialogHeader className="border-b pb-3">
                    <div className="flex items-center gap-2 text-cyan-800">
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-100 text-cyan-800">
                            <Ruler className="h-5 w-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold text-slate-900">
                                Manual Meter Entry
                            </DialogTitle>
                            <p className="text-xs text-muted-foreground">
                                {line.item_description}
                            </p>
                        </div>
                    </div>
                </DialogHeader>

                <form onSubmit={handleSave} className="space-y-4 py-2">
                    {/* Item Information Card */}
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-500 font-medium">Group Name:</span>
                            <span className="font-bold text-slate-800">{line.group_name || "—"}</span>
                        </div>
                        <div className="flex justify-between items-center border-t border-slate-200/60 pt-2">
                            <span className="text-slate-500 font-medium">Actual Received Quantity (PO):</span>
                            <span className="font-extrabold text-slate-900 text-sm">
                                {receivedQty} {uom}
                            </span>
                        </div>
                    </div>

                    {/* Meter Entry Input */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-800">
                            Manual Meter Quantity (Meter) <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <Input
                                autoFocus
                                type="number"
                                step="0.01"
                                min="0.01"
                                placeholder="e.g. 8.5"
                                value={meterValue}
                                onChange={(e) => setMeterValue(e.target.value)}
                                className="h-10 text-sm font-semibold pl-3 pr-16 border-cyan-400 focus:ring-cyan-500"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200">
                                Meter
                            </div>
                        </div>
                        <p className="text-[11px] text-slate-500">
                            Enter the actual meter measured for this received quantity.
                        </p>
                    </div>

                    {/* Logic summary preview */}
                    <div className="rounded-lg border border-cyan-100 bg-cyan-50/60 p-3 text-xs space-y-1.5 text-cyan-950">
                        <p className="font-bold flex items-center gap-1.5 text-cyan-900">
                            <Check className="h-3.5 w-3.5 text-cyan-700" /> Receiving & Stock Action:
                        </p>
                        <ul className="space-y-1 pl-5 list-disc text-[11px] text-cyan-900">
                            <li>
                                <strong>PO Received:</strong> {receivedQty} {uom} count hoga.
                            </li>
                            <li>
                                <strong>Inventory Stock:</strong> {meterValue ? Number(meterValue).toFixed(2) : "—"} Meter add hoga (Kg stock add nahi hoga).
                            </li>
                            <li>
                                <strong>Inventory Available Qty:</strong> Meter mein show hoga.
                            </li>
                        </ul>
                    </div>

                    <DialogFooter className="border-t pt-3 flex flex-wrap justify-between gap-2 sm:justify-end">
                        {line.manual_meter_quantity && (
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={handleClear}
                                className="text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 mr-auto"
                            >
                                Clear Meter Entry
                            </Button>
                        )}
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="bg-cyan-700 hover:bg-cyan-800 text-white font-semibold text-xs"
                        >
                            Save Meter Entry
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
