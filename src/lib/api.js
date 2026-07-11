const BASE =
    import.meta.env.VITE_API_URL ||
    "http://127.0.0.1:8000";

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

// ── Purchase Orders ───────────────────────────────────────────────────────────
export const fetchPurchaseOrders = (params) => get("/api/purchase-orders", params);
export const fetchPurchaseOrder = (id, openedBy) =>
    get(`/api/purchase-orders/${id}`, openedBy ? { opened_by: openedBy } : undefined);
export const createPurchaseOrder = (body) => post("/api/purchase-orders", body);
export const updatePurchaseOrder = (id, body) => put(`/api/purchase-orders/${id}`, body);
export const deletePurchaseOrder = (id, deletedBy) => del(`/api/purchase-orders/${id}`, deletedBy ? { deleted_by: deletedBy } : undefined);
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

export const importPurchaseOrders = async (file, onConflict = "skip") => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE}/api/purchase-orders/import?on_conflict=${onConflict}`, {
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

// ── Sales ────────────────────────────────────────────────────────────────────
export const fetchSales = (params) => get("/api/sales", params);
export const fetchSale = (id) => get(`/api/sales/${id}`);
export const createSale = (body) => post("/api/sales", body);
export const updateSale = (id, body) => put(`/api/sales/${id}`, body);
export const deleteSale = (id, deletedBy) => del(`/api/sales/${id}`, deletedBy ? { deleted_by: deletedBy } : undefined);
export const addSaleActivity = (id, body) => post(`/api/sales/${id}/activities`, body);
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

export const importSales = async (file, onConflict = "skip") => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE}/api/sales/import?on_conflict=${onConflict}`, {
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

// ── Inventory ────────────────────────────────────────────────────────────────
export const fetchInventory = () => get("/api/inventory");
export const createProduct = (body) => post("/api/inventory", body);
export const updateProduct = (id, body) => put(`/api/inventory/${id}`, body);
export const deleteProduct = (id) => del(`/api/inventory/${id}`);

// ── Clients & Projects ───────────────────────────────────────────────────────
export const fetchClients = (params) => get("/api/clients", params);
export const fetchClientStats = () => get("/api/clients/stats");
export const createClient = (body) => post("/api/clients", body);
export const deleteClient = (id, deletedBy) => del(`/api/clients/${id}`, deletedBy ? { deleted_by: deletedBy } : undefined);
export const fetchProjects = (params) => get("/api/projects", params);
export const createProject = (body) => post("/api/projects", body);

// ── Records ──────────────────────────────────────────────────────────────────
export const fetchRecords = (params) => get("/api/records", params);
export const createRecord = (body) => post("/api/records", body);
export const updateRecord = (id, body) => put(`/api/records/${id}`, body);
export const deleteRecord = (id) => del(`/api/records/${id}`);

// ── Reports ──────────────────────────────────────────────────────────────────
export const fetchReport = (params) => get("/api/reports", params);
export const fetchFulfillmentReport = (params) => get("/api/reports/fulfillment", params);
export const fetchPendingPOs = () => get("/api/reports/pending-pos");

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

export const importReport = async (file, reportType, onConflict = "skip") => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE}/api/reports/import?report_type=${reportType}&on_conflict=${onConflict}`, {
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

export const importCombinedReport = async (file, onConflict = "skip") => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE}/api/reports/import-combined?on_conflict=${onConflict}`, {
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
export const openInvoiceDocument = (saleId) => {
    window.open(`${BASE}/api/documents/invoice/${saleId}`, "_blank");
};
export const downloadInvoiceDocument = (saleId) => {
    window.open(`${BASE}/api/documents/invoice/${saleId}?download=true`, "_blank");
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
