import { useEffect } from "react";

// Applies the same Excel-style table controls across Store screens. It keeps
// page data and existing action buttons intact while adding S.No., column
// resizing, and per-column sort/filter menus to the table DOM.
export default function StoreTableEnhancer() {
    useEffect(() => {
        const menus = new Set();
        const stickyBars = new Map();
        const closeMenus = () => menus.forEach(menu => { menu.style.display = "none"; });
        const updateStickyBars = () => {
            stickyBars.forEach(({ wrapper, table, bar, inner }) => {
                const rect = wrapper.getBoundingClientRect();
                const hasOverflow = table.scrollWidth > wrapper.clientWidth;
                const active = hasOverflow && rect.top < window.innerHeight - 44 && rect.bottom > 100;
                inner.style.width = `${table.scrollWidth}px`;
                bar.style.display = active ? "block" : "none";
                bar.style.left = `${Math.max(0, rect.left)}px`;
                bar.style.width = `${Math.min(rect.width, window.innerWidth - Math.max(0, rect.left))}px`;
            });
        };
        const attachStickyBar = table => {
            const wrapper = table.parentElement;
            if (!wrapper?.classList.contains("overflow-x-auto") || stickyBars.has(table)) return;
            wrapper.classList.add("store-table-scroll-wrapper");
            const bar = document.createElement("div"); bar.className = "store-sticky-scrollbar";
            const inner = document.createElement("div"); bar.appendChild(inner); document.body.appendChild(bar);
            let syncing = false;
            wrapper.addEventListener("scroll", () => { if (!syncing) { syncing = true; bar.scrollLeft = wrapper.scrollLeft; syncing = false; } });
            bar.addEventListener("scroll", () => { if (!syncing) { syncing = true; wrapper.scrollLeft = bar.scrollLeft; syncing = false; } });
            stickyBars.set(table, { wrapper, table, bar, inner });
        };
        const enhance = table => {
            if (!table.tHead || !table.tBodies.length) return;
            // This table is rendered by StorePurchaseOrders and already owns
            // its select/S.No./resize layout from the first paint.
            if (table.classList.contains("store-purchase-orders-table")) table.dataset.storeEnhanced = "purchase-native";
            // Purchase Orders owns its own React column grid and resize logic.
            // Only attach the shared sticky scrollbar; never alter its columns.
            if (table.dataset.storeEnhanced === "purchase-native") {
                // Purchase Orders has its own React column sizing. Give its
                // existing header arrows the same Excel-style filter popup as
                // the rest of Store Purchase without adding a second header.
                if (!table.dataset.storeNativeFilters) {
                    table.dataset.storeNativeFilters = "true";
                    const headRow = table.tHead?.rows[0];
                    const body = table.tBodies[0];
                    const cellValue = cell => cell?.querySelector("p, span")?.textContent.trim() || cell?.textContent.trim() || "—";
                    const renumber = () => [...body.rows].filter(row => row.style.display !== "none").forEach((row, index) => { if (row.cells[1]) row.cells[1].textContent = String(index + 1); });
                    const showNativeMenu = (th, column, anchor) => {
                        closeMenus();
                        const unique = [...new Set([...body.rows].map(row => cellValue(row.cells[column])))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                        const menu = document.createElement("div");
                        menu.className = "store-filter-menu";
                        // The page-level click handler closes only clicks
                        // outside the popup; checkbox and button clicks here
                        // must stay inside so selection can be changed.
                        menu.addEventListener("click", event => event.stopPropagation());
                        menu.innerHTML = `<button data-sort="asc">↟&nbsp; Sort A to Z</button><button data-sort="desc">↡&nbsp; Sort Z to A</button><div class="store-filter-divider"></div><button data-clear class="store-filter-clear">⌫&nbsp; Clear Filter from "${th.textContent.trim()}"</button><div class="store-filter-divider"></div><div class="store-filter-search"><span>⌕</span><input data-search placeholder="Search..." /></div><div data-options></div><div class="store-filter-actions"><button data-cancel>Cancel</button><button data-apply>OK</button></div>`;
                        document.body.appendChild(menu); menus.add(menu);
                        const options = menu.querySelector("[data-options]");
                        let selected = new Set(unique);
                        const draw = term => {
                            const visible = unique.filter(value => value.toLowerCase().includes(term.toLowerCase()));
                            options.innerHTML = "";
                            const all = document.createElement("label"); all.className = "store-filter-select-all";
                            all.innerHTML = `<input type="checkbox" ${visible.length && visible.every(value => selected.has(value)) ? "checked" : ""} /> <span>(Select All)</span>`;
                            all.querySelector("input").onchange = event => { visible.forEach(value => event.target.checked ? selected.add(value) : selected.delete(value)); draw(term); };
                            options.appendChild(all);
                            visible.forEach(value => {
                                const label = document.createElement("label");
                                const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = selected.has(value);
                                checkbox.onchange = event => event.target.checked ? selected.add(value) : selected.delete(value);
                                label.append(checkbox, document.createTextNode(` ${value}`)); options.appendChild(label);
                            });
                        };
                        const sortRows = direction => {
                            [...body.rows].sort((left, right) => cellValue(left.cells[column]).localeCompare(cellValue(right.cells[column]), undefined, { numeric: true }) * (direction === "asc" ? 1 : -1)).forEach(row => body.appendChild(row));
                            renumber(); closeMenus();
                        };
                        draw("");
                        menu.querySelector("[data-search]").oninput = event => draw(event.target.value);
                        menu.querySelector("[data-sort=asc]").onclick = () => sortRows("asc");
                        menu.querySelector("[data-sort=desc]").onclick = () => sortRows("desc");
                        menu.querySelector("[data-clear]").onclick = () => { [...body.rows].forEach(row => { row.style.display = ""; }); renumber(); closeMenus(); };
                        menu.querySelector("[data-cancel]").onclick = closeMenus;
                        menu.querySelector("[data-apply]").onclick = () => { [...body.rows].forEach(row => { row.style.display = selected.size === unique.length || selected.has(cellValue(row.cells[column])) ? "" : "none"; }); renumber(); closeMenus(); };
                        const rect = anchor.getBoundingClientRect();
                        menu.style.left = `${Math.min(rect.left, window.innerWidth - 270)}px`;
                        menu.style.top = `${rect.bottom + 4}px`;
                    };
                    table.addEventListener("click", event => {
                        const button = event.target.closest("th button");
                        if (!button || button.getAttribute("aria-label")?.startsWith("Resize")) return;
                        const th = button.closest("th"); const column = [...headRow.cells].indexOf(th);
                        if (column < 2 || column === headRow.cells.length - 1) return;
                        event.preventDefault(); event.stopPropagation();
                        showNativeMenu(th, column, button);
                    }, true);
                }
                attachStickyBar(table);
                updateStickyBars();
                return;
            }
            // Store tables use a fixed column grid, just like Purchase Orders.
            // This makes a dragged header width apply to its complete column.
            table.style.tableLayout = "fixed";
            const headRow = table.tHead.rows[0]; const body = table.tBodies[0];
            if (!headRow || !body) return;
            let columnGrid = table.querySelector(":scope > colgroup[data-store-columns]");
            const ensureColumnGrid = () => {
                const headers = [...headRow.cells];
                if (!columnGrid || columnGrid.children.length !== headers.length) {
                    columnGrid?.remove();
                    columnGrid = document.createElement("colgroup");
                    columnGrid.dataset.storeColumns = "true";
                    headers.forEach(header => { const col = document.createElement("col"); col.style.width = `${Math.ceil(header.getBoundingClientRect().width)}px`; columnGrid.appendChild(col); });
                    table.insertBefore(columnGrid, table.firstChild);
                }
                return columnGrid;
            };
            const syncTableWidth = () => {
                const columns = ensureColumnGrid();
                const columnsWidth = [...columns.children].reduce((total, col) => total + Number.parseFloat(col.style.width || "0"), 0);
                const viewportWidth = table.parentElement?.clientWidth || 0;
                const width = Math.ceil(Math.max(viewportWidth, columnsWidth));
                table.style.width = `${width}px`;
                table.style.minWidth = `${width}px`;
            };
            const nativeSerial = table.dataset.storeNativeSno === "true";
            if (nativeSerial) {
                // React owns both the serial header and its cells on this
                // table. Remove only the legacy DOM-injected counterparts so
                // every value returns directly below its real header.
                [...headRow.cells].forEach((cell, index) => {
                    if (cell.classList.contains("store-sno-header")) {
                        headRow.deleteCell(index);
                        [...body.rows].forEach(row => {
                            if (row.cells[index]?.classList.contains("store-sno-cell")) row.deleteCell(index);
                        });
                    }
                });
            }
            // Some Store tables now own their S.No. column in React. During a
            // hot render an older injected header can remain in the DOM, which
            // previously caused a second S.No. and shifted every header. Keep
            // the first serial header only; body rows already have one cell.
            const serialHeaders = [...headRow.cells]
                .map((cell, index) => ({ cell, index }))
                .filter(({ cell }) => cell.textContent.trim().toLowerCase().startsWith("s.no"));
            serialHeaders.slice(1).reverse().forEach(({ index }) => headRow.deleteCell(index));
            if (table.dataset.storeEnhanced) {
                // If React replaced all tbody rows, none will have the store-sno-cell class.
                // In that case reset the flag so the full enhance below re-injects S.No.
                // We do NOT modify DOM here (would trigger MutationObserver → loop).
                const hasAnySnoCell = body.rows.length > 0 &&
                    [...body.rows].some(row => row.cells[0]?.classList.contains("store-sno-cell"));
                if (!hasAnySnoCell && body.rows.length > 0) {
                    // Remove injected S.No. header so it won't duplicate on re-enhance
                    const snoTh = [...headRow.cells].find(c => c.classList.contains("store-sno-header"));
                    if (snoTh) headRow.deleteCell([...headRow.cells].indexOf(snoTh));
                    delete table.dataset.storeEnhanced;
                    // Fall through to full enhance below
                } else {
                    syncTableWidth(); return;
                }
            }
            table.dataset.storeEnhanced = "true";
            const hasSerialColumn = [...headRow.cells].some(cell => cell.textContent.trim().toLowerCase().startsWith("s.no"));
            if (!hasSerialColumn && !nativeSerial) {
                const th = document.createElement("th"); th.textContent = "S.No."; th.className = "store-sno-header"; headRow.insertBefore(th, headRow.firstChild);
                [...body.rows].forEach((row, index) => {
                    // Guard: if first cell is already our S.No. cell, just update its number
                    if (row.cells[0]?.classList.contains("store-sno-cell")) {
                        row.cells[0].textContent = String(index + 1);
                        return;
                    }
                    const cell = row.insertCell(0); cell.className = "store-sno-cell"; cell.textContent = String(index + 1);
                });
            }
            ensureColumnGrid();
            const renumber = () => [...body.rows].forEach((row, index) => { const cell = row.cells[0]; if (cell?.classList.contains("store-sno-cell")) cell.textContent = String(index + 1); });
            [...headRow.cells].forEach((th, column) => {
                // S.No. has no sort/filter menu, but its right divider must
                // be draggable too, exactly like every other Store column.
                if (column === 0) {
                    if (th.dataset.storeResizeAttached) return;
                    th.dataset.storeResizeAttached = "true";
                    th.classList.add("store-filter-header");
                    const resize = document.createElement("span"); resize.className = "store-resize-handle"; resize.title = "Drag to resize S.No. column"; th.appendChild(resize);
                    resize.addEventListener("mousedown", event => {
                        event.preventDefault(); const startX = event.clientX; const width = th.getBoundingClientRect().width;
                        const move = e => { const next = Math.max(48, width + e.clientX - startX); const col = ensureColumnGrid().children[column]; if (col) col.style.width = `${next}px`; th.style.width = `${next}px`; th.style.minWidth = `${next}px`; syncTableWidth(); };
                        const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); syncTableWidth(); };
                        document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
                    });
                    return;
                }
                if (th.dataset.storeControlAttached) return;
                const label = th.textContent.trim().toLowerCase();
                const minimumWidths = { "s.no.": 70, "groups name": 160, "items name": 145, vendor: 140, "u/m": 90, "previous qty": 130, "current month qty": 165, "total qty": 120, "issue qty": 120, "available qty": 140, rate: 90, amount: 120, location: 120, status: 110, actions: 250 };
                const minimumWidth = minimumWidths[label] || 65;
                th.style.minWidth = `${minimumWidth}px`;
                if (label === "status" || label === "actions") th.style.width = `${minimumWidth}px`;
                th.dataset.storeControlAttached = "true"; th.classList.add("store-filter-header");
                const trigger = document.createElement("button"); trigger.type = "button"; trigger.className = "store-filter-trigger"; trigger.textContent = "↕"; trigger.title = "Sort & Filter"; th.appendChild(trigger);
                const resize = document.createElement("span"); resize.className = "store-resize-handle"; resize.title = "Drag to resize column"; th.appendChild(resize);
                const menu = document.createElement("div"); menu.className = "store-filter-menu"; menu.style.display = "none"; menu.addEventListener("click", event => event.stopPropagation()); document.body.appendChild(menu); menus.add(menu);
                const values = () => [...new Set([...body.rows].map(row => row.cells[column]?.textContent.trim() || "—"))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                const apply = () => { const checked = new Set([...menu.querySelectorAll("input[data-value]:checked")].map(x => x.dataset.value)); [...body.rows].forEach(row => { row.style.display = !checked.size || checked.has(row.cells[column]?.textContent.trim() || "—") ? "" : "none"; }); renumber(); };
                const sort = direction => { const rows = [...body.rows]; rows.sort((a, b) => { const left = a.cells[column]?.textContent.trim() || ""; const right = b.cells[column]?.textContent.trim() || ""; const numberLeft = Number(left.replace(/[^0-9.-]/g, "")); const numberRight = Number(right.replace(/[^0-9.-]/g, "")); const result = Number.isFinite(numberLeft) && Number.isFinite(numberRight) && /\d/.test(left) && /\d/.test(right) ? numberLeft - numberRight : left.localeCompare(right, undefined, { numeric: true }); return direction === "asc" ? result : -result; }); rows.forEach(row => body.appendChild(row)); renumber(); };
                const showMenu = () => { closeMenus(); const rect = trigger.getBoundingClientRect(); const unique = values(); menu.innerHTML = `<button data-sort="asc">↟&nbsp; Sort A to Z</button><button data-sort="desc">↡&nbsp; Sort Z to A</button><div class="store-filter-divider"></div><button data-clear class="store-filter-clear">⌫&nbsp; Clear Filter from "${th.textContent.trim().replace("↕", "").trim()}"</button><div class="store-filter-divider"></div><div class="store-filter-search"><span>⌕</span><input data-search placeholder="Search..." /></div><div data-options></div><div class="store-filter-actions"><button data-cancel>Cancel</button><button data-apply>OK</button></div>`; const options = menu.querySelector("[data-options]"); let selected = new Set(unique); const draw = term => { const visible = unique.filter(v => v.toLowerCase().includes(term.toLowerCase())); options.innerHTML = ""; const all = document.createElement("label"); all.className = "store-filter-select-all"; all.innerHTML = `<input type="checkbox" data-select-all ${visible.length && visible.every(value => selected.has(value)) ? "checked" : ""} /> <span>(Select All)</span>`; options.appendChild(all); all.querySelector("input").onchange = event => { visible.forEach(value => event.target.checked ? selected.add(value) : selected.delete(value)); draw(term); }; visible.forEach(value => { const label = document.createElement("label"); label.innerHTML = `<input type="checkbox" data-value="${value.replaceAll('"', '&quot;')}" ${selected.has(value) ? "checked" : ""} /> <span>${value}</span>`; label.querySelector("input").onchange = event => { event.target.checked ? selected.add(value) : selected.delete(value); }; options.appendChild(label); }); }; draw(""); menu.querySelector("[data-search]").addEventListener("input", e => draw(e.target.value)); menu.querySelector("[data-sort=asc]").onclick = () => { sort("asc"); closeMenus(); }; menu.querySelector("[data-sort=desc]").onclick = () => { sort("desc"); closeMenus(); }; menu.querySelector("[data-clear]").onclick = () => { [...body.rows].forEach(row => { row.style.display = ""; }); renumber(); closeMenus(); }; menu.querySelector("[data-cancel]").onclick = closeMenus; menu.querySelector("[data-apply]").onclick = () => { const checked = new Set(selected); [...body.rows].forEach(row => { row.style.display = checked.size === unique.length || checked.has(row.cells[column]?.textContent.trim() || "—") ? "" : "none"; }); renumber(); closeMenus(); }; menu.style.left = `${Math.min(rect.left, window.innerWidth - 270)}px`; menu.style.top = `${rect.bottom + 4}px`; menu.style.display = "block"; };
                trigger.addEventListener("click", event => { event.stopPropagation(); showMenu(); });
                resize.addEventListener("mousedown", event => { event.preventDefault(); const startX = event.clientX; const width = th.getBoundingClientRect().width; const move = e => { const next = Math.max(minimumWidth, width + e.clientX - startX); const col = ensureColumnGrid().children[column]; if (col) col.style.width = `${next}px`; th.style.width = `${next}px`; th.style.minWidth = `${next}px`; syncTableWidth(); }; const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); syncTableWidth(); }; document.addEventListener("mousemove", move); document.addEventListener("mouseup", up); });
            });
            syncTableWidth();
            attachStickyBar(table);
            updateStickyBars();
        };
        let scanning = false;
        const scan = () => {
            if (scanning) return;
            scanning = true;
            try {
                document.querySelectorAll("main table").forEach(enhance);
                updateStickyBars();
            } finally {
                scanning = false;
            }
        };
        scan(); const observer = new MutationObserver(scan); observer.observe(document.body, { childList: true, subtree: true }); document.addEventListener("click", closeMenus); window.addEventListener("scroll", updateStickyBars, true); window.addEventListener("resize", updateStickyBars);
        return () => { observer.disconnect(); document.removeEventListener("click", closeMenus); window.removeEventListener("scroll", updateStickyBars, true); window.removeEventListener("resize", updateStickyBars); menus.forEach(menu => menu.remove()); stickyBars.forEach(({ bar }) => bar.remove()); };
    }, []);
    return null;
}
