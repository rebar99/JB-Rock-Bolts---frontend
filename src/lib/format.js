export const inr = (n) => {
    const val = Number(n) || 0;
    return new Intl.NumberFormat("en-IN", { 
        style: "currency", 
        currency: "INR", 
        minimumFractionDigits: val % 1 === 0 ? 0 : 2, 
        maximumFractionDigits: 2 
    }).format(val);
};

export const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export const fmtDateTime = (iso) =>
    new Date(iso).toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });