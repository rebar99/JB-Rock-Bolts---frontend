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
const del = (path) => request(path, { method: "DELETE" });

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
export const deletePurchaseOrder = (id) => del(`/api/purchase-orders/${id}`);
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

// ── Sales ────────────────────────────────────────────────────────────────────
export const fetchSales = (params) => get("/api/sales", params);
export const fetchSale = (id) => get(`/api/sales/${id}`);
export const createSale = (body) => post("/api/sales", body);
export const updateSale = (id, body) => put(`/api/sales/${id}`, body);
export const deleteSale = (id) => del(`/api/sales/${id}`);
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

// ── Inventory ────────────────────────────────────────────────────────────────
export const fetchInventory = () => get("/api/inventory");
export const createProduct = (body) => post("/api/inventory", body);
export const updateProduct = (id, body) => put(`/api/inventory/${id}`, body);
export const deleteProduct = (id) => del(`/api/inventory/${id}`);

// ── Clients & Projects ───────────────────────────────────────────────────────
export const fetchClients = (params) => get("/api/clients", params);
export const createClient = (body) => post("/api/clients", body);
export const deleteClient = (id) => del(`/api/clients/${id}`);
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

// ── Logs ─────────────────────────────────────────────────────────────────────
export const fetchLogs = (limit = 50) => get("/api/logs", { limit });
