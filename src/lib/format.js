import { fmtDateIST, fmtDateTimeIST } from "./timezone";

export const inr = (n) => {
    const val = Number(n) || 0;
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: val % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
    }).format(val);
};

// All callers of fmtDate / fmtDateTime automatically get IST output.
export const fmtDate     = fmtDateIST;
export const fmtDateTime = fmtDateTimeIST;
