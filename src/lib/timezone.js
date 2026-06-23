/**
 * Centralized IST (Asia/Kolkata, UTC+05:30) timezone utilities.
 *
 * Why this file exists
 * ─────────────────────
 * The backend stores all datetimes in UTC (MySQL NOW() on a UTC server) and
 * serialises them with an explicit +00:00 offset.  Without explicit handling,
 * browser APIs can display them in the OS locale timezone, which may not be IST.
 * Every timestamp displayed to the user must go through one of the helpers below
 * so the display is always consistent IST regardless of the client OS timezone.
 */

const IST = "Asia/Kolkata";

/**
 * Parse a datetime string from the API into a JS Date (absolute UTC epoch).
 * The backend runs on Windows IST, so MySQL NOW() stores IST local time as
 * a naive value.  The API now appends "+05:30"; this fallback handles any
 * legacy or date-only strings that arrive without a timezone suffix.
 */
function parseUTC(str) {
    if (!str) return null;
    const hasOffset = str.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(str);
    // Fallback: treat naive strings as IST (the server's local timezone)
    const d = new Date(hasOffset ? str : str + "+05:30");
    return isNaN(d.getTime()) ? null : d;
}

/**
 * "23 Jul 2026" — date only, IST
 */
export function fmtDateIST(str) {
    const d = parseUTC(str);
    if (!d) return "—";
    return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: IST,
    });
}

/**
 * "23 Jul 2026, 10:45 AM" — date and time, IST
 */
export function fmtDateTimeIST(str) {
    const d = parseUTC(str);
    if (!d) return "—";
    return d.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: IST,
    });
}

/**
 * Human-friendly relative time in IST:
 *   < 1 min    → "Just now"
 *   1–59 min   → "5 mins ago"
 *   1–23 hr    → "2 hours ago"
 *   yesterday  → "Yesterday at 8:30 PM"
 *   older      → "23 Jul 2026, 10:45 AM"
 */
export function relativeTimeIST(str) {
    const d = parseUTC(str);
    if (!d) return "—";

    const now = new Date();
    const diffMs = now - d;

    if (diffMs < 0) return fmtDateTimeIST(str); // clock-skew guard

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr  = Math.floor(diffMin / 60);

    if (diffSec < 60)  return "Just now";
    if (diffMin < 60)  return `${diffMin} min${diffMin !== 1 ? "s" : ""} ago`;
    if (diffHr  < 24)  return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;

    // Compare calendar dates in IST to detect "yesterday"
    const isoOpts = { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" };
    const todayIST = new Date(now.toLocaleDateString("en-CA", isoOpts)); // "YYYY-MM-DD"
    const dateIST  = new Date(d.toLocaleDateString("en-CA", isoOpts));
    const daysDiff = Math.round((todayIST - dateIST) / 86_400_000);

    if (daysDiff === 1) {
        const timeStr = d.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            timeZone: IST,
        });
        return `Yesterday at ${timeStr}`;
    }

    return fmtDateTimeIST(str);
}
