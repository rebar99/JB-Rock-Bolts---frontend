import { useEffect, useState } from "react";
import { ArrowLeft, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

// Two-step selection-only dropdown for the PO Item field, sourced from the
// Item Master list. Step 1: pick an item name. Step 2: if that item has
// sizes on record, pick one of those — the two are joined into a single
// "Name Size" string (e.g. "Couplers 16mm") on selection, which is what
// gets saved, so nothing downstream (Reports/Overview's dia-wise parsing,
// which already pulls a trailing size like "16mm" out of the item text)
// needs to change. Items with no sizes resolve immediately in step 1.
//
// There is deliberately no way to submit free text at either step —
// CommandInput only filters the existing CommandItems, so a name/size that
// isn't in the master list can never be entered here.
export const parseSizeValues = (sizeStr) => {
    const matches = (sizeStr || "").match(/\d+(?:\.\d+)?/g);
    if (!matches) return [0];
    return matches.map(Number);
};

export const compareSizes = (aSizeStr, bSizeStr) => {
    const aVals = parseSizeValues(aSizeStr);
    const bVals = parseSizeValues(bSizeStr);
    const len = Math.max(aVals.length, bVals.length);
    for (let i = 0; i < len; i++) {
        const aVal = aVals[i] !== undefined ? aVals[i] : -1;
        const bVal = bVals[i] !== undefined ? bVals[i] : -1;
        if (aVal !== bVal) {
            return aVal - bVal;
        }
    }
    return (aSizeStr || "").localeCompare(bSizeStr || "", undefined, { numeric: true, sensitivity: 'base' });
};

export const ItemCombobox = ({ value, onChange, items = [], placeholder = "Select item...", disabled }) => {
    const [open, setOpen] = useState(false);
    const [activeItem, setActiveItem] = useState(null); // item object while picking its size

    useEffect(() => {
        if (!open) setActiveItem(null);
    }, [open]);

    const selectItem = (item) => {
        const sizes = item.sizes || [];
        if (sizes.length === 0) {
            onChange(item.name);
            setOpen(false);
        } else {
            setActiveItem(item);
        }
    };

    const selectSize = (sizeLabel) => {
        onChange(`${activeItem.name} ${sizeLabel}`);
        setOpen(false);
    };

    return (
        <Popover open={open && !disabled} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn("w-full justify-between font-normal", disabled && "bg-muted text-muted-foreground opacity-100 cursor-not-allowed")}
                >
                    <span className={cn("truncate text-left", !value && "text-muted-foreground")}>
                        {value || placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                {!activeItem ? (
                    <Command>
                        <CommandInput placeholder="Search item..." />
                        <CommandList>
                            <CommandEmpty>No item found.</CommandEmpty>
                            <CommandGroup>
                                {items.map((item) => (
                                    <CommandItem
                                        key={item.id ?? item.name}
                                        value={item.name}
                                        onSelect={() => selectItem(item)}
                                    >
                                        <Check className={cn("mr-2 h-4 w-4", value === item.name ? "opacity-100" : "opacity-0")} />
                                        <span className="truncate flex-1">{item.name}</span>
                                        {(item.sizes || []).length > 0 && (
                                            <span className="text-[10px] text-muted-foreground ml-2 shrink-0">{item.sizes.length} sizes</span>
                                        )}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                ) : (
                    <Command>
                        <div className="flex items-center gap-1 px-2 pt-2">
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setActiveItem(null)}>
                                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Items
                            </Button>
                            <span className="text-xs font-medium text-muted-foreground truncate">{activeItem.name} — select size</span>
                        </div>
                        <CommandInput placeholder="Search size..." />
                        <CommandList>
                            <CommandEmpty>No size found.</CommandEmpty>
                            <CommandGroup>
                                {[...activeItem.sizes].sort((a, b) => compareSizes(a.size, b.size)).map((s) => (
                                    <CommandItem
                                        key={s.id}
                                        value={s.size}
                                        onSelect={() => selectSize(s.size)}
                                    >
                                        <Check className={cn("mr-2 h-4 w-4", value === `${activeItem.name} ${s.size}` ? "opacity-100" : "opacity-0")} />
                                        <span className="truncate">{s.size}</span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                )}
            </PopoverContent>
        </Popover>
    );
};
