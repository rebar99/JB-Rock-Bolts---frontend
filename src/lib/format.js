import { fmtDateIST, fmtDateTimeIST } from "./timezone";

// Rounds to 2 decimal places (nearest paisa), guarding against
// floating-point drift from repeated arithmetic (e.g. 0.1 + 0.2). Use this
// anywhere a monetary amount is computed client-side, instead of
// Math.round(), which truncates to a whole number and destroys decimals.
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const inr = (n) => {
    const val = Number(n) || 0;
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(val);
};

// All callers of fmtDate / fmtDateTime automatically get IST output.
export const fmtDate     = fmtDateIST;
export const fmtDateTime = fmtDateTimeIST;
