import { useEffect } from "react";

// The three Stock Operations dialogs share the same material master.  This
// helper adds one Items Name dropdown immediately after that material
// selector and keeps the two selections synchronized.
export default function StockItemNameAssist({ inventory = [] }) {
    useEffect(() => {
        const attach = () => {
            document.querySelectorAll('[role="dialog"] form').forEach(form => {
                const materialLabel = [...form.querySelectorAll("label")].find(label => label.firstChild?.textContent?.trim().startsWith("Groups Name"));
                if (!materialLabel || materialLabel.dataset.stockItemAttached) return;
                const control = materialLabel.querySelector("input, select");
                if (!control) return;
                materialLabel.dataset.stockItemAttached = "true";
                const label = document.createElement("label");
                label.className = "block text-sm font-medium text-slate-700";
                label.textContent = "Items Name";
                const output = document.createElement("select");
                output.className = "mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-background px-3 text-sm text-slate-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";
                output.innerHTML = '<option value="">Select items name</option>';
                [...new Set(inventory.map(item => item.stock_item).filter(Boolean))].forEach(name => {
                    const option = document.createElement("option"); option.value = name; option.textContent = name; output.appendChild(option);
                });
                label.appendChild(output);
                materialLabel.parentElement?.insertBefore(label, materialLabel.nextSibling);
                const sync = () => {
                    const material = control.tagName === "SELECT"
                        ? inventory.find(item => String(item.id) === control.value)
                        : inventory.find(item => item.name.toLowerCase() === control.value.trim().toLowerCase());
                    output.value = material?.stock_item || "";
                };
                output.addEventListener("change", () => {
                    const material = inventory.find(item => item.stock_item === output.value);
                    if (!material) return;
                    if (control.tagName === "SELECT") control.value = String(material.id);
                    else control.value = material.name;
                    control.dispatchEvent(new Event("input", { bubbles: true }));
                    control.dispatchEvent(new Event("change", { bubbles: true }));
                });
                control.addEventListener("input", sync);
                control.addEventListener("change", sync);
                sync();
            });
        };
        attach();
        const observer = new MutationObserver(attach);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [inventory]);
    return null;
}
