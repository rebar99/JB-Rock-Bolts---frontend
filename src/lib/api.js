const BASE = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

const getToken = () => localStorage.getItem("auth_token");

async function request(path, options = {}) {
    const url = `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;
    const token = getToken();
    try {
        const res = await fetch(url, {
            mode: "cors",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                ...(token ? { "Authorization": `Bearer ${token}` } : {}),
                ...options.headers
            },
            ...options,
        });
        if (!res.ok) {
            if (res.status === 401) {
                localStorage.removeItem("auth_token");
                localStorage.removeItem("auth_user");
                localStorage.removeItem("app_current_user");
                window.location.href = "/login";
                return;
            }
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(err.detail || `Server error: ${res.status}`);
        }
        if (res.status === 204) return null;
        return res.json();
    } catch (err) {
        console.error("Fetch error:", err);
        if (err.message.includes("Failed to fetch")) {
            throw new Error("Cannot connect to server. Please check if the backend is running on " + BASE);
        }
        throw err;
    }
}

const get = (path, params) => {
    const url = params
        ? `${path}?${new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))).toString()}`
        : path;
    return request(url);
};
const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });
const put = (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) });
const del = (path, params) => {
    const url = params
        ? `${path}?${new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))).toString()}`
        : path;
    return request(url, { method: "DELETE" });
};

// ── Constants ────────────────────────────────────────────────────────────────
export const fetchConstants = () => get("/api/constants");

// ── Dashboard ────────────────────────────────────────────────────────────────
export const fetchDashboardStats = () => get("/api/dashboard/stats");
export const fetchDashboardCharts = () => get("/api/dashboard/charts");
export const fetchRecentSales = (limit = 6) => get("/api/dashboard/recent-sales", { limit });
export const fetchDashboardClients = () => get("/api/dashboard/clients");
export const fetchMonthlyProductSales = (year) => get("/api/dashboard/monthly-product-sales", year ? { year } : undefined);

// ── Purchase Orders ───────────────────────────────────────────────────────────
export const fetchPurchaseOrders = (params) => get("/api/purchase-orders", { limit: 10000, ...params });
export const fetchPurchaseOrder = (id, openedBy) =>
    get(`/api/purchase-orders/${id}`, openedBy ? { opened_by: openedBy } : undefined);
export const createPurchaseOrder = (body) => post("/api/purchase-orders", body);
export const updatePurchaseOrder = (id, body) => put(`/api/purchase-orders/${id}`, body);
export const deletePurchaseOrder = (id, deletedBy) => del(`/api/purchase-orders/${id}`, deletedBy ? { deleted_by: deletedBy } : undefined);
export const bulkDeletePurchaseOrders = (ids, deletedBy) => post("/api/purchase-orders/bulk-delete", { ids, deleted_by: deletedBy });
export const shortClosePurchaseOrder = (id, body) => post(`/api/purchase-orders/${id}/short-close`, body);
export const uploadPOFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE}/api/purchase-orders/upload`, {
        method: "POST",
        body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
};

// ── PO Export / Import ────────────────────────────────────────────────────────
export const exportPurchaseOrders = async () => {
    const token = getToken();
    const res = await fetch(`${BASE}/api/purchase-orders/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-orders-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
};

export const importPurchaseOrders = async (file, onConflict = "skip", createdBy) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const qs = createdBy ? `&created_by=${encodeURIComponent(createdBy)}` : "";
    const res = await fetch(`${BASE}/api/purchase-orders/import?on_conflict=${onConflict}${qs}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Import failed");
    }
    return res.json();
};

// ── Work Orders ────────────────────────────────────────────────────────────────
export const fetchWorkOrders = (params) => get("/api/work-orders", { limit: 10000, ...params });
export const fetchWorkOrder = (id, openedBy) =>
    get(`/api/work-orders/${id}`, openedBy ? { opened_by: openedBy } : undefined);
export const createWorkOrder = (body) => post("/api/work-orders", body);
export const updateWorkOrder = (id, body) => put(`/api/work-orders/${id}`, body);
export const deleteWorkOrder = (id, deletedBy) => del(`/api/work-orders/${id}`, deletedBy ? { deleted_by: deletedBy } : undefined);
export const bulkDeleteWorkOrders = (ids, deletedBy) => post("/api/work-orders/bulk-delete", { ids, deleted_by: deletedBy });
export const closeWorkOrder = (id, body) => post(`/api/work-orders/${id}/close`, body);
export const fetchNextWONumber = () => get("/api/work-orders/next-number");
export const uploadWorkOrderFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE}/api/work-orders/upload`, {
        method: "POST",
        body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
};

// ── Work Order Export / Import ────────────────────────────────────────────────
export const exportWorkOrders = async () => {
    const token = getToken();
    const res = await fetch(`${BASE}/api/work-orders/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `work-orders-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
};

export const importWorkOrders = async (file, onConflict = "skip", createdBy) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const qs = createdBy ? `&created_by=${encodeURIComponent(createdBy)}` : "";
    const res = await fetch(`${BASE}/api/work-orders/import?on_conflict=${onConflict}${qs}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const errorMessage = Array.isArray(err.detail) ? err.detail.map(e => e.msg).join(", ") : (err.detail || "Import failed");
        throw new Error(errorMessage);
    }
    return res.json();
};

// ── Work Order Reports ────────────────────────────────────────────────────────
export const fetchWorkOrderReport = (params) => get("/api/work-order-reports", params);

export const exportWorkOrderReport = async (params = {}) => {
    const token = getToken();
    const qp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== "") qp.set(k, v); });
    const qs = qp.toString();
    const res = await fetch(`${BASE}/api/work-order-reports/export${qs ? `?${qs}` : ""}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `work-order-report-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
};

export const exportCombinedWorkOrderReport = async (sheets, params = {}) => {
    const token = getToken();
    const qp = new URLSearchParams({ sheets: sheets.join(",") });
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== "") qp.set(k, v); });
    const res = await fetch(`${BASE}/api/work-order-reports/export-combined?${qp.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `work-order-reports-combined-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
};

export const importCombinedWorkOrderReport = async (file, onConflict = "skip", createdBy) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const qs = createdBy ? `&created_by=${encodeURIComponent(createdBy)}` : "";
    const res = await fetch(`${BASE}/api/work-order-reports/import-combined?on_conflict=${onConflict}${qs}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const errorMessage = Array.isArray(err.detail) ? err.detail.map(e => e.msg).join(", ") : (err.detail || "Import failed");
        throw new Error(errorMessage);
    }
    return res.json();
};

// ── Sales ────────────────────────────────────────────────────────────────────
export const fetchSales = (params) => get("/api/sales", { limit: 10000, ...params });
export const fetchSale = (id) => get(`/api/sales/${id}`);
export const createSale = (body) => post("/api/sales", body);
export const updateSale = (id, body) => put(`/api/sales/${id}`, body);
export const deleteSale = (id, deletedBy) => del(`/api/sales/${id}`, deletedBy ? { deleted_by: deletedBy } : undefined);
export const bulkDeleteSales = (ids, deletedBy) => post("/api/sales/bulk-delete", { ids, deleted_by: deletedBy });
export const addSaleActivity = (id, body) => post(`/api/sales/${id}/activities`, body);
export const addSaleDispatch = (id, body) => post(`/api/sales/${id}/dispatches`, body);
export const markSaleDelivered = (id, body) => put(`/api/sales/${id}/mark-delivered`, body);
export const uploadInvoiceFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE}/api/sales/upload`, {
        method: "POST",
        body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
};

// ── Sales Export / Import ─────────────────────────────────────────────────────
export const exportSales = async () => {
    const token = getToken();
    const res = await fetch(`${BASE}/api/sales/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
};

export const importSales = async (file, onConflict = "skip", createdBy) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const qs = createdBy ? `&created_by=${encodeURIComponent(createdBy)}` : "";
    const res = await fetch(`${BASE}/api/sales/import?on_conflict=${onConflict}${qs}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const errorMessage = Array.isArray(err.detail) ? err.detail.map(e => e.msg).join(", ") : (err.detail || "Import failed");
        throw new Error(errorMessage);
    }
    return res.json();
};

// ── Work Order Sales ─────────────────────────────────────────────────────────
export const fetchWorkOrderSales = (params) => get("/api/work-order-sales", { limit: 10000, ...params });
export const fetchWorkOrderSale = (id) => get(`/api/work-order-sales/${id}`);
export const createWorkOrderSale = (body) => post("/api/work-order-sales", body);
export const updateWorkOrderSale = (id, body) => put(`/api/work-order-sales/${id}`, body);
export const deleteWorkOrderSale = (id, deletedBy) => del(`/api/work-order-sales/${id}`, deletedBy ? { deleted_by: deletedBy } : undefined);
export const bulkDeleteWorkOrderSales = (ids, deletedBy) => post("/api/work-order-sales/bulk-delete", { ids, deleted_by: deletedBy });
export const addWorkOrderSaleActivity = (id, body) => post(`/api/work-order-sales/${id}/activities`, body);
export const addWorkOrderSaleDispatch = (id, body) => post(`/api/work-order-sales/${id}/dispatches`, body);
export const deleteWorkOrderSaleDispatch = (id, dispatchId, deletedBy) => del(`/api/work-order-sales/${id}/dispatches/${dispatchId}`, deletedBy ? { deleted_by: deletedBy } : undefined);
export const markWorkOrderSaleDelivered = (id, body) => put(`/api/work-order-sales/${id}/mark-delivered`, body);
export const uploadWorkOrderSaleFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE}/api/work-order-sales/upload`, {
        method: "POST",
        body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
};

// ── Work Order Sales Export / Import ──────────────────────────────────────────
export const exportWorkOrderSales = async () => {
    const token = getToken();
    const res = await fetch(`${BASE}/api/work-order-sales/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `work-order-sales-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
};

export const importWorkOrderSales = async (file, onConflict = "skip", createdBy) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const qs = createdBy ? `&created_by=${encodeURIComponent(createdBy)}` : "";
    const res = await fetch(`${BASE}/api/work-order-sales/import?on_conflict=${onConflict}${qs}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const errorMessage = Array.isArray(err.detail) ? err.detail.map(e => e.msg).join(", ") : (err.detail || "Import failed");
        throw new Error(errorMessage);
    }
    return res.json();
};

// ── Work Order Sales Report ───────────────────────────────────────────────────
export const fetchWorkOrderSalesReport = (params) => get("/api/work-order-reports/sales", params);

// ── Inventory ────────────────────────────────────────────────────────────────
export const fetchInventory = () => get("/api/inventory");
export const createProduct = (body) => post("/api/inventory", body);
export const updateProduct = (id, body) => put(`/api/inventory/${id}`, body);
export const deleteProduct = (id) => del(`/api/inventory/${id}`);

// ── Clients & Projects ───────────────────────────────────────────────────────
export const fetchClients = (params) => get("/api/clients", { limit: 10000, ...params });
export const fetchClientStats = () => get("/api/clients/stats");
export const createClient = (body) => post("/api/clients", body);
export const deleteClient = (id, deletedBy) => del(`/api/clients/${id}`, deletedBy ? { deleted_by: deletedBy } : undefined);
export const fetchProjects = (params) => get("/api/projects", { limit: 10000, ...params });
export const createProject = (body) => post("/api/projects", body);

// ── Item Master (PO Item field) ─────────────────────────────────────────────
export const fetchItemMasterList = (type = "PO") => get(`/api/item-master?type=${type}`);
export const createItemMasterItem = (body) => post("/api/item-master", body);
export const updateItemMasterItem = (id, body) => put(`/api/item-master/${id}`, body);
export const deleteItemMasterItem = (id, deletedBy, type = "PO") => del(`/api/item-master/${id}`, { deleted_by: deletedBy, type });
export const addItemMasterSize = (itemId, body) => post(`/api/item-master/${itemId}/sizes`, body);
export const deleteItemMasterSize = (itemId, sizeId, deletedBy, type = "PO") => del(`/api/item-master/${itemId}/sizes/${sizeId}`, { deleted_by: deletedBy, type });

// ── Records ──────────────────────────────────────────────────────────────────
export const fetchRecords = (params) => get("/api/records", { limit: 10000, ...params });
export const createRecord = (body) => post("/api/records", body);
export const updateRecord = (id, body) => put(`/api/records/${id}`, body);
export const deleteRecord = (id) => del(`/api/records/${id}`);

// ── Reports ──────────────────────────────────────────────────────────────────
export const fetchReport = (params) => get("/api/reports", params);
export const fetchFulfillmentReport = (params) => get("/api/reports/fulfillment", params);
export const fetchPendingPOs = () => get("/api/reports/pending-pos");
export const fetchPOFulfillmentSummary = (poId) => get(`/api/reports/po-fulfillment-summary/${poId}`);
export const fetchOverviewReport = () => get("/api/reports/overview");
export const fetchProductPendingReport = (params) => get("/api/reports/product-pending", params);

export const exportProductPendingReport = async (params = {}) => {
    const token = getToken();
    const qp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== "") qp.set(k, v); });
    const res = await fetch(`${BASE}/api/reports/product-pending/export?${qp.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `product-wise-pending-analysis-${params.po_status?.toLowerCase() || "pending"}-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
};

export const exportReport = async (reportType, params = {}) => {
    const token = getToken();
    const qp = new URLSearchParams({ report_type: reportType });
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== "") qp.set(k, v); });
    const res = await fetch(`${BASE}/api/reports/export?${qp.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportType}-report-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
};

export const importReport = async (file, reportType, onConflict = "skip", createdBy) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const qs = createdBy ? `&created_by=${encodeURIComponent(createdBy)}` : "";
    const res = await fetch(`${BASE}/api/reports/import?report_type=${reportType}&on_conflict=${onConflict}${qs}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const errorMessage = Array.isArray(err.detail) ? err.detail.map(e => e.msg).join(", ") : (err.detail || "Import failed");
        throw new Error(errorMessage);
    }
    return res.json();
};

export const exportCombinedReport = async (sheets, params = {}) => {
    const token = getToken();
    const qp = new URLSearchParams({ sheets: sheets.join(",") });
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== "") qp.set(k, v); });
    const res = await fetch(`${BASE}/api/reports/export-combined?${qp.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reports-combined-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
};

export const importCombinedReport = async (file, onConflict = "skip", createdBy) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const qs = createdBy ? `&created_by=${encodeURIComponent(createdBy)}` : "";
    const res = await fetch(`${BASE}/api/reports/import-combined?on_conflict=${onConflict}${qs}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Import failed");
    }
    return res.json();
};

// ── Documents (opens in new tab for printing) ─────────────────────────────────
export const openPODocument = (poId) => {
    window.open(`${BASE}/api/documents/po/${poId}`, "_blank");
};
export const openWODocument = (woId) => {
    window.open(`${BASE}/api/documents/wo/${woId}`, "_blank");
};
export const openInvoiceDocument = (saleId) => {
    window.open(`${BASE}/api/documents/invoice/${saleId}`, "_blank");
};
export const downloadInvoiceDocument = (saleId) => {
    window.open(`${BASE}/api/documents/invoice/${saleId}?download=true`, "_blank");
};
export const openWOInvoiceDocument = (saleId) => {
    window.open(`${BASE}/api/documents/wo-invoice/${saleId}`, "_blank");
};
export const downloadWOInvoiceDocument = (saleId) => {
    window.open(`${BASE}/api/documents/wo-invoice/${saleId}?download=true`, "_blank");
};

// ── Users ────────────────────────────────────────────────────────────────────
export const loginUser = (body) => post("/api/users/login", body);
export const registerUser = (body) => post("/api/users/register", body);
export const fetchUsers = () => get("/api/users");
export const updateUser = (id, body) => put(`/api/users/${id}`, body);
export const resetPassword = (body) => post("/api/users/reset-password", body);

// ── User Approvals (admin only) ────────────────────────────────────────────
export const fetchPendingUsers = () => get("/api/users/pending");
export const approveUser = (id) => post(`/api/users/${id}/approve`, {});
export const rejectUser = (id) => post(`/api/users/${id}/reject`, {});

export const logoutUser = () => request("/api/users/logout", { method: "POST" });

// The request() helper already reads the token from localStorage and adds
// the Authorization header automatically — no need to pass it manually here.
export const heartbeat = () => request("/api/users/heartbeat", { method: "POST" });

export const fetchActiveSessions = () => get("/api/users/active-sessions");

// ── Logs ─────────────────────────────────────────────────────────────────────
export const fetchLogs = (limit = 100) => get("/api/logs", { limit });

// Returns users who currently have the app open (SSE-based, instant)
export const fetchOnlineUsers = () => get("/api/logs/online-users");
export const fetchRecentLogins = () => get("/api/users/recent-logins");

/**
 * Open a Server-Sent Events connection to receive new log entries in real time.
 * Passing user info registers the browser as "online" on the server side via the
 * SSE connection itself — no separate heartbeat or database table needed.
 *
 * @param {(log: object) => void} onLog      - called whenever the server pushes a new log
 * @param {(err: Event)  => void} [onError]  - called on connection error
 * @param {{ id, name, email }} [user]       - current authenticated user (for presence tracking)
 * @returns {EventSource} call .close() to disconnect
 */
export function openLogStream(onLog, onError, user = null) {
    const params = new URLSearchParams();
    if (user?.id)    params.set("user_id",    user.id);
    if (user?.name)  params.set("user_name",  user.name);
    if (user?.email) params.set("user_email", user.email);

    const qs = params.toString();
    const es = new EventSource(`${BASE}/api/logs/stream${qs ? `?${qs}` : ""}`);
    es.onmessage = (e) => {
        try { onLog(JSON.parse(e.data)); } catch { /* malformed JSON — ignore */ }
    };
    if (onError) es.onerror = onError;
    return es;
}

// 🔹 UOM Management 🔹
export const fetchUomOptions = () => get("/api/uom");
export const createUomOption = (body) => post("/api/uom", body);
export const updateUomOption = (id, body) => put(`/api/uom/${id}`, body);
export const deleteUomOption = (id) => del(`/api/uom/${id}`);

// 🔹 Company Addresses 🔹
export const fetchCompanyAddresses = () => get("/api/company-addresses");
export const createCompanyAddress = (body) => post("/api/company-addresses", body);
export const updateCompanyAddress = (id, body) => put(`/api/company-addresses/${id}`, body);
export const deleteCompanyAddress = (id) => del(`/api/company-addresses/${id}`);
export const setCompanyAddressDefault = (id) => post(`/api/company-addresses/${id}/set-default`);


