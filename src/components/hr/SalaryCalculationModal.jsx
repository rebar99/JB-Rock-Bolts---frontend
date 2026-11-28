/**
 * SalaryCalculationModal.jsx
 * Employee-wise Salary Calculation Screen for HR → Attendance section.
 *
 * Opens from the "View Salary" button in the attendance table.
 * Auto-fetches: attendance summary (from attendance module) + employee details.
 * Provides: Calculate, Edit, Save Salary, Download PDF, Print actions.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    X,
    Calculator,
    Download,
    Printer,
    Save,
    Edit2,
    CheckCircle2,
    AlertCircle,
    Info,
    Lock,
    FileText,
    IndianRupee,
    Calendar,
    User,
    MapPin,
    Briefcase,
    Clock,
} from "lucide-react";
import {
    previewHRSalary,
    generateHRSalary,
    updateHRSalary,
    fetchHRSalary,
    fetchHRSalarySlip,
    fetchHRSalaries,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import jbEngineeringLogo from "@/assets/jb-engineering-logo.jpg";

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

const fmt = (n) => Math.round(Number(n || 0)).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtInt = (n) => Math.round(Number(n || 0)).toLocaleString("en-IN");

const getVal = (v) => (v !== null && v !== undefined && v !== "") ? Number(v) : undefined;

export default function SalaryCalculationModal({ open, onClose, employee, month, year }) {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const printRef = useRef(null);
    const isSuperAdmin = Boolean(user?.is_super_admin);

    // Editable overrides
    const [editing, setEditing] = useState(false);
    const [overtime, setOvertime] = useState(0);
    const [travelAllowance, setTravelAllowance] = useState(0);
    const [advanceDeduction, setAdvanceDeduction] = useState(0);
    const [otherDeductions, setOtherDeductions] = useState(0);
    const [remarks, setRemarks] = useState("");
    const [saving, setSaving] = useState(false);

    // Allowance & deduction overrides (null = auto-calc from config, number = user override)
    const [hraOverride, setHraOverride] = useState(null);
    const [convOverride, setConvOverride] = useState(null);
    const [medOverride, setMedOverride] = useState(null);
    const [pfOverride, setPfOverride] = useState(null);
    const [esiOverride, setEsiOverride] = useState(null);
    const [tdsOverride, setTdsOverride] = useState(null);

    const [forceRecalc, setForceRecalc] = useState(false);

    // Live preview data fetched from API on open or manual recalculate
    const { data: preview, isLoading: loadingPreview, refetch: refetchPreview } = useQuery({
        queryKey: ["hr-salary-preview", employee?.employee_id, month, year, forceRecalc],
        queryFn: () =>
            previewHRSalary({
                employee_id: employee?.employee_id,
                month,
                year,
                force_recalc: forceRecalc,
            }),
        enabled: open && !!employee?.employee_id && !!month && !!year,
        staleTime: 0,
        placeholderData: (prev) => prev,
    });

    // When editing: pre-fill overrides from existing saved record or calculated values
    useEffect(() => {
        if (editing) {
            const saved = preview?.existing_salary_data;
            if (saved) {
                setOvertime(saved.overtime_amount ?? 0);
                setTravelAllowance(saved.travel_allowance ?? 0);
                setAdvanceDeduction(saved.advance_deduction ?? 0);
                setOtherDeductions(saved.other_deductions ?? 0);
                setHraOverride(saved.hra !== null && saved.hra !== undefined ? Number(saved.hra) : (calc?.hra ?? 0));
                setConvOverride(saved.conveyance !== null && saved.conveyance !== undefined ? Number(saved.conveyance) : (calc?.conveyance ?? 0));
                setMedOverride(saved.medical_allowance !== null && saved.medical_allowance !== undefined ? Number(saved.medical_allowance) : (calc?.medical_allowance ?? 0));
                setPfOverride(saved.pf_deduction !== null && saved.pf_deduction !== undefined ? Number(saved.pf_deduction) : (calc?.pf_deduction ?? 0));
                setEsiOverride(saved.esi_deduction !== null && saved.esi_deduction !== undefined ? Number(saved.esi_deduction) : (calc?.esi_deduction ?? 0));
                setTdsOverride(saved.tds_deduction !== null && saved.tds_deduction !== undefined ? Number(saved.tds_deduction) : (calc?.tds_deduction ?? 0));
                setRemarks(saved.remarks ?? "");
            } else if (calc) {
                setOvertime(calc.overtime_amount ?? 0);
                setTravelAllowance(calc.travel_allowance ?? 0);
                setAdvanceDeduction(calc.advance_deduction ?? 0);
                setOtherDeductions(calc.other_deductions ?? 0);
                setHraOverride(calc.hra ?? 0);
                setConvOverride(calc.conveyance ?? 0);
                setMedOverride(calc.medical_allowance ?? 0);
                setPfOverride(calc.pf_deduction ?? 0);
                setEsiOverride(calc.esi_deduction ?? 0);
                setTdsOverride(calc.tds_deduction ?? 0);
            }
        } else {
            setHraOverride(null);
            setConvOverride(null);
            setMedOverride(null);
            setPfOverride(null);
            setEsiOverride(null);
            setTdsOverride(null);
            setOvertime(0);
            setTravelAllowance(0);
            setAdvanceDeduction(0);
            setOtherDeductions(0);
            setRemarks("");
        }
    }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch saved salary history for this employee (all months)
    const { data: rawHistory = [] } = useQuery({
        queryKey: ["hr-salaries-employee", employee?.employee_id],
        queryFn: () => fetchHRSalaries({ employee_id: employee?.employee_id }),
        enabled: open && !!employee?.employee_id,
    });
    const salaryHistory = Array.isArray(rawHistory) ? rawHistory : [];
    const previousSalaries = salaryHistory.filter(
        (s) => !(s.month === month && s.year === year)
    );

    const emp = preview?.employee;
    const period = preview?.period;
    const att = preview?.attendance_summary;
    const calc = preview?.calculation;
    const existingSalaryId = preview?.existing_salary_id;
    const existingStatus = preview?.existing_salary_status;
    const isAttClosed = preview?.is_attendance_closed;

    const isAlreadySaved = !!existingSalaryId;
    const isFinalized = existingStatus === "Paid";
    const isEditable = !isFinalized && editing;

    // Database record if already generated
    const saved = preview?.existing_salary_data;

    // Base fallback values: prefer saved DB values, then calculated preview values
    const baseHra = saved?.hra !== null && saved?.hra !== undefined ? Number(saved.hra) : Number(calc?.hra ?? 0);
    const baseConv = saved?.conveyance !== null && saved?.conveyance !== undefined ? Number(saved.conveyance) : Number(calc?.conveyance ?? calc?.conveyance_amount ?? 0);
    const baseMed = saved?.medical_allowance !== null && saved?.medical_allowance !== undefined ? Number(saved.medical_allowance) : Number(calc?.medical_allowance ?? calc?.medical_amount ?? 0);
    const basePf = saved?.pf_deduction !== null && saved?.pf_deduction !== undefined ? Number(saved.pf_deduction) : Number(calc?.pf_deduction ?? 0);
    const baseEsi = saved?.esi_deduction !== null && saved?.esi_deduction !== undefined ? Number(saved.esi_deduction) : Number(calc?.esi_deduction ?? 0);
    const baseTds = saved?.tds_deduction !== null && saved?.tds_deduction !== undefined ? Number(saved.tds_deduction) : Number(calc?.tds_deduction ?? 0);
    const baseAdv = saved?.advance_deduction !== null && saved?.advance_deduction !== undefined ? Number(saved.advance_deduction) : Number(calc?.advance_deduction ?? 0);
    const baseOther = saved?.other_deductions !== null && saved?.other_deductions !== undefined ? Number(saved.other_deductions) : Number(calc?.other_deductions ?? 0);
    const baseOt = saved?.overtime_amount !== null && saved?.overtime_amount !== undefined ? Number(saved.overtime_amount) : Number(calc?.overtime_amount ?? 0);
    const baseTa = saved?.travel_allowance !== null && saved?.travel_allowance !== undefined ? Number(saved.travel_allowance) : Number(calc?.travel_allowance ?? 0);

    // Current values in use
    const currentBasic = Number(calc?.base_salary ?? (calc?.present_salary > 25000 ? (calc?.present_salary || 0) * 0.5 : 12750));
    const currentHra = (editing && hraOverride !== null) ? (hraOverride === "" ? 0 : Number(hraOverride)) : baseHra;
    const currentConv = (editing && convOverride !== null) ? (convOverride === "" ? 0 : Number(convOverride)) : baseConv;
    const currentMed = (editing && medOverride !== null) ? (medOverride === "" ? 0 : Number(medOverride)) : baseMed;

    const currentPf = (editing && pfOverride !== null) ? (pfOverride === "" ? 0 : Number(pfOverride)) : basePf;
    const currentEsi = (editing && esiOverride !== null) ? (esiOverride === "" ? 0 : Number(esiOverride)) : baseEsi;
    const currentTds = (editing && tdsOverride !== null) ? (tdsOverride === "" ? 0 : Number(tdsOverride)) : baseTds;
    const currentAdv = editing ? (advanceDeduction === "" ? 0 : Number(advanceDeduction || 0)) : baseAdv;
    const currentOther = editing ? (otherDeductions === "" ? 0 : Number(otherDeductions || 0)) : baseOther;
    const currentOt = editing ? (overtime === "" ? 0 : Number(overtime || 0)) : baseOt;
    const currentTa = editing ? (travelAllowance === "" ? 0 : Number(travelAllowance || 0)) : baseTa;

    const currentGross = Math.round(currentBasic + currentHra + currentConv + currentMed);
    const currentTotalEarnings = Math.round(currentGross + currentOt + currentTa);
    const currentTotalDeductions = Math.round(currentPf + currentEsi + currentTds + currentAdv + currentOther);
    const currentNet = Math.round(Math.max(0, currentTotalEarnings - currentTotalDeductions));

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                hra_amount: Number(currentHra ?? 0),
                conveyance_amount: Number(currentConv ?? 0),
                medical_amount: Number(currentMed ?? 0),
                overtime_amount: Number(currentOt ?? 0),
                travel_allowance_amount: Number(currentTa ?? 0),
                pf_deduction: Number(currentPf ?? 0),
                esi_deduction: Number(currentEsi ?? 0),
                tds_deduction: Number(currentTds ?? 0),
                advance_deduction: Number(currentAdv ?? 0),
                other_deductions: Number(currentOther ?? 0),
                remarks: remarks || undefined,
            };

            if (isAlreadySaved) {
                if (!editing) {
                    toast.warning("Salary already saved. Click Edit to modify before re-saving.");
                    return;
                }
                await updateHRSalary(existingSalaryId, payload);
                toast.success("Salary updated successfully!");
            } else {
                await generateHRSalary({
                    employee_id: employee?.employee_id,
                    month,
                    year,
                    ...payload,
                });
                toast.success("Salary saved successfully!");
            }

            setEditing(false);
            queryClient.invalidateQueries({ queryKey: ["hr-salaries"] });
            queryClient.invalidateQueries({ queryKey: ["hr-salaries-employee", employee?.employee_id] });
            queryClient.invalidateQueries({ queryKey: ["hr-salary-preview", employee?.employee_id, month, year] });
            queryClient.invalidateQueries({ queryKey: ["hr-dashboard"] });
            await refetchPreview();
        } catch (err) {
            toast.error(err.message || "Failed to save salary");
        } finally {
            setSaving(false);
        }
    };

    const handlePrint = () => {
        const content = printRef.current;
        if (!content) return;
        const printWindow = window.open("", "_blank");
        printWindow.document.write(`
            <html>
                <head>
                    <title>Salary Slip - ${emp?.name} - ${MONTH_NAMES[(month || 1) - 1]} ${year}</title>
                    <style>
                        * { box-sizing: border-box; margin: 0; padding: 0; }
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 24px; color: #1e293b; font-size: 12px; }
                        .slip-wrap { max-width: 760px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
                        .header { background: #183260; color: white; padding: 16px 20px; display: flex; align-items: center; gap: 16px; }
                        .header img { height: 48px; border-radius: 4px; }
                        .company-name { font-size: 18px; font-weight: bold; }
                        .slip-title { font-size: 11px; opacity: 0.8; margin-top: 2px; }
                        .section { padding: 12px 20px; border-bottom: 1px solid #e2e8f0; }
                        .section-title { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin-bottom: 8px; }
                        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
                        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 16px; }
                        .field { display: flex; flex-direction: column; gap: 1px; }
                        .field-label { font-size: 9px; color: #94a3b8; text-transform: uppercase; font-weight: 600; }
                        .field-value { font-size: 12px; font-weight: 600; color: #1e293b; }
                        table.breakdown { width: 100%; border-collapse: collapse; margin-top: 4px; }
                        table.breakdown th, table.breakdown td { padding: 5px 10px; text-align: left; font-size: 11px; border: 1px solid #e2e8f0; }
                        table.breakdown th { background: #f8fafc; font-weight: 700; color: #334155; }
                        table.breakdown td.amount { text-align: right; font-weight: 600; }
                        .total-row td { font-weight: 800; background: #f1f5f9; }
                        .net-row td { font-weight: 900; background: #183260; color: white; font-size: 13px; }
                        .status-badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: bold; background: #dcfce7; color: #166534; }
                        .footer { padding: 10px 20px; background: #f8fafc; text-align: center; font-size: 10px; color: #94a3b8; }
                        @media print { body { padding: 0; } .slip-wrap { border: none; } }
                    </style>
                </head>
                <body>
                    ${content.innerHTML}
                    <script>window.print(); window.close();<\/script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const handleDownloadPDF = () => {
        handlePrint();
        toast.info("Use your browser's 'Save as PDF' option in the print dialog.");
    };

    const handleClose = () => {
        setEditing(false);
        setForceRecalc(false);
        setOvertime(0);
        setTravelAllowance(0);
        setAdvanceDeduction(0);
        setOtherDeductions(0);
        setHraOverride(null);
        setConvOverride(null);
        setMedOverride(null);
        setPfOverride(null);
        setEsiOverride(null);
        setTdsOverride(null);
        setRemarks("");
        onClose();
    };

    const perDay = calc ? (calc.present_salary / (calc.total_working_days || 26)) : 0;

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
            <DialogContent
                className="max-w-5xl max-h-[95vh] overflow-y-auto p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
                onPointerDownOutside={(e) => e.preventDefault()}
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                {/* Modal Header */}
                <div className="sticky top-0 z-30 bg-[#183260] text-white px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Calculator className="h-5 w-5 text-blue-200" />
                        <div>
                            <h2 className="text-base font-bold">Salary Calculation</h2>
                            <p className="text-xs text-blue-200 mt-0.5">
                                {emp?.name || employee?.name} &mdash; {MONTH_NAMES[(month || 1) - 1]} {year}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Status Badge */}
                        {isAlreadySaved && (
                            <span className={cn(
                                "rounded-full px-3 py-0.5 text-[10px] font-bold uppercase",
                                existingStatus === "Paid"
                                    ? "bg-emerald-500 text-white"
                                    : existingStatus === "Approved"
                                    ? "bg-blue-400 text-white"
                                    : existingStatus === "On Hold"
                                    ? "bg-amber-400 text-white"
                                    : "bg-slate-400 text-white"
                            )}>
                                {existingStatus}
                            </span>
                        )}
                        <button onClick={handleClose} className="rounded-lg p-1.5 hover:bg-white/10 transition">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {loadingPreview && !preview ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#183260] border-t-transparent" />
                        <p className="mt-3 text-sm">Fetching salary data...</p>
                    </div>
                ) : (
                    <div className="p-5 space-y-5">
                        {/* Attendance Status Banner */}
                        {!isAttClosed ? (
                            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3.5 text-amber-900 dark:text-amber-200">
                                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                                <div className="text-xs">
                                    <p className="font-bold">Attendance Not Verified</p>
                                    <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                                        Attendance for {MONTH_NAMES[(month || 1) - 1]} {year} is not yet verified & closed.
                                        Salary preview is available but saving requires attendance to be locked first.
                                    </p>
                                </div>
                            </div>
                        ) : isAlreadySaved ? (
                            <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-emerald-900 dark:text-emerald-200">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                <p className="text-xs">
                                    <span className="font-bold">Salary saved</span> for {MONTH_NAMES[(month || 1) - 1]} {year}.
                                    Status: <span className="font-bold">{existingStatus}</span>.
                                    {!isFinalized && " You can edit and re-save if needed."}
                                    {isFinalized && " This salary is finalized (Paid) — changes are locked."}
                                </p>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 rounded-xl border border-blue-300 bg-blue-50 dark:bg-blue-950/40 p-3 text-blue-900 dark:text-blue-200">
                                <Info className="h-4 w-4 shrink-0 text-blue-600" />
                                <p className="text-xs">
                                    Attendance verified & locked. Review the salary calculation below and click <b>Save Salary</b> to finalize.
                                </p>
                            </div>
                        )}

                        {/* ─── Employee Info Card ─── */}
                        <div className="rounded-xl border border-border bg-card shadow-xs">
                            <div className="border-b border-border px-4 py-2.5 flex items-center gap-2">
                                <User className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Employee Details</span>
                            </div>
                            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
                                <div>
                                    <p className="text-[9px] uppercase font-bold text-muted-foreground">Employee Name</p>
                                    <p className="text-sm font-bold text-foreground mt-0.5">{emp?.name || employee?.name}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase font-bold text-muted-foreground">Employee Code</p>
                                    <p className="text-sm font-bold font-mono text-[#183260] dark:text-cyan-400 mt-0.5">{emp?.employee_code || employee?.employee_code}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase font-bold text-muted-foreground">Designation</p>
                                    <p className="text-xs font-semibold text-foreground mt-0.5">{emp?.designation || employee?.designation || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase font-bold text-muted-foreground">Location</p>
                                    <p className="text-xs font-semibold text-foreground mt-0.5">{emp?.location || employee?.location || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase font-bold text-muted-foreground">Date of Joining</p>
                                    <p className="text-xs font-semibold text-foreground mt-0.5">
                                        {emp?.date_of_joining
                                            ? new Date(emp.date_of_joining).toLocaleDateString("en-IN")
                                            : "—"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase font-bold text-muted-foreground">Starting Salary</p>
                                    <p className="text-xs font-semibold text-foreground mt-0.5">₹{fmt(emp?.starting_salary)}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase font-bold text-muted-foreground">Present (Current) Salary</p>
                                    <p className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5">₹{fmt(emp?.present_salary)}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase font-bold text-muted-foreground">Salary Month</p>
                                    <p className="text-xs font-bold text-[#183260] dark:text-blue-300 mt-0.5">{MONTH_NAMES[(month || 1) - 1]} {year}</p>
                                </div>
                            </div>
                        </div>

                        {/* ─── Attendance Summary Card ─── */}
                        <div className="rounded-xl border border-border bg-card shadow-xs">
                            <div className="border-b border-border px-4 py-2.5 flex items-center gap-2">
                                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Attendance Summary — {MONTH_NAMES[(month || 1) - 1]} {year}
                                </span>
                                <span className="ml-auto text-[10px] text-muted-foreground">Auto-fetched from Attendance Module</span>
                            </div>
                            <div className="p-4 grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-2.5">
                                {[
                                    { label: "Calendar Days", value: att?.total_calendar_days, color: "text-foreground", bg: "bg-muted/60" },
                                    { label: "Present (P)", value: att?.present, color: "text-emerald-700", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
                                    { label: "Travel (TR)", value: att?.travel ?? 0, color: "text-teal-700", bg: "bg-teal-50 dark:bg-teal-950/40", subtext: "100% Paid" },
                                    { label: "Absent (A)", value: att?.absent, color: "text-red-700", bg: "bg-red-50 dark:bg-red-950/40" },
                                    { label: "Half Day (H)", value: att?.half_day, color: "text-amber-700", bg: "bg-amber-50 dark:bg-amber-950/40", subtext: "0.5 Cut" },
                                    { label: "Half Day (HD)", value: att?.half_day_paid ?? 0, color: "text-lime-800 dark:text-lime-300", bg: "bg-lime-50 dark:bg-lime-950/40", subtext: "100% Paid" },
                                    { label: "Paid Leave (PL)", value: att?.paid_leave, color: "text-blue-700", bg: "bg-blue-50 dark:bg-blue-950/40", subtext: "100% Paid" },
                                    { label: "Unpaid Leave (UL)", value: att?.unpaid_leave ?? 0, color: "text-rose-700", bg: "bg-rose-50 dark:bg-rose-950/40", subtext: "Salary Deducted" },
                                    { label: "Weekly Off (WO)", value: att?.weekly_off, color: "text-emerald-700", bg: "bg-emerald-50/70 dark:bg-emerald-950/30", subtext: "100% Paid" },
                                    { label: "Holiday (HOL)", value: att?.holiday, color: "text-purple-700", bg: "bg-purple-50 dark:bg-purple-950/40", subtext: "100% Paid" },
                                    { label: "Total Paid Days", value: att?.total_paid_days ?? att?.total_present_days, color: "text-[#183260] dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-950/40", bold: true, subtext: "For Salary" },
                                ].map(({ label, value, color, bg, bold, subtext }) => (
                                    <div key={label} className={cn("rounded-lg p-2 text-center flex flex-col justify-between", bg)}>
                                        <div>
                                            <p className={cn("text-base font-black", color, bold && "text-lg")}>{value ?? 0}</p>
                                            <p className="text-[9px] text-muted-foreground font-medium mt-0.5 leading-tight">{label}</p>
                                        </div>
                                        {subtext && (
                                            <span className="mt-1 text-[8px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                                                {subtext}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ─── Salary Calculation Breakdown ─── */}
                        <div className="rounded-xl border border-border bg-card shadow-xs">
                            <div className="border-b border-border px-4 py-2.5 flex items-center gap-2">
                                <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Salary Calculation Breakdown</span>
                                {editing && (
                                    <span className="ml-auto text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full">
                                        Edit Mode
                                    </span>
                                )}
                            </div>

                            <div className="p-4 grid md:grid-cols-2 gap-5">
                                {/* Earnings Side */}
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2">Earnings</p>
                                    <table className="w-full text-xs border-collapse">
                                        <tbody className="divide-y divide-border/60">
                                            <tr className="bg-muted/20">
                                                <td className="py-2 px-3 text-muted-foreground">Monthly Salary</td>
                                                <td className="py-2 px-3 text-right font-semibold">₹{fmt(calc?.present_salary)}</td>
                                            </tr>
                                            <tr>
                                                <td className="py-2 px-3 text-muted-foreground">Total Days in Month</td>
                                                <td className="py-2 px-3 text-right font-semibold">{calc?.days_in_month || 30} days</td>
                                            </tr>
                                            <tr className="bg-muted/20">
                                                <td className="py-2 px-3 text-muted-foreground">Per Day Salary</td>
                                                <td className="py-2 px-3 text-right font-semibold">₹{fmt(perDay)}</td>
                                            </tr>
                                            <tr>
                                                <td className="py-2 px-3 text-muted-foreground flex items-center gap-1">
                                                    <span>Total Paid Days</span>
                                                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/60 px-1 rounded">Paid</span>
                                                </td>
                                                <td className="py-2 px-3 text-right font-bold text-emerald-700">
                                                    {att?.total_paid_days ?? att?.total_present_days ?? 0} days
                                                </td>
                                            </tr>

                                            {/* Basic Salary Structure */}
                                            <tr className="bg-blue-50/50 dark:bg-blue-950/20">
                                                <td className="py-1.5 px-3 text-[10px] font-bold text-blue-700 uppercase tracking-wider" colSpan={2}>
                                                    Basic Salary Breakdown (Proportionate)
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="py-2 px-3 text-muted-foreground">
                                                    Basic Salary
                                                    <span className="ml-1 text-[9px] text-blue-600">
                                                        ({(calc?.present_salary || 0) > 25000 ? "50% of Present" : "Fixed ₹12,750"})
                                                    </span>
                                                    {calc?.monthly_basic > 0 && (
                                                        <span className="block text-[9px] text-muted-foreground">Monthly: ₹{fmt(calc?.monthly_basic)}</span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-right font-semibold">₹{fmt(calc?.base_salary ?? (calc?.present_salary > 25000 ? (calc?.present_salary || 0) * 0.5 : 12750))}</td>
                                            </tr>
                                            <tr className="bg-muted/20">
                                                <td className="py-2 px-3 text-muted-foreground">
                                                    HRA
                                                    <span className="ml-1 text-[9px] text-blue-600">
                                                        ({(calc?.present_salary || 0) > 25000 ? "25% of Present" : "Present - Basic - CONV - Med"})
                                                    </span>
                                                    {calc?.monthly_hra > 0 && (
                                                        <span className="block text-[9px] text-muted-foreground">Monthly: ₹{fmt(calc?.monthly_hra)}</span>
                                                    )}
                                                    {isEditable && (
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={hraOverride !== null ? hraOverride : baseHra}
                                                            onChange={(e) => setHraOverride(e.target.value === "" ? "" : Number(e.target.value))}
                                                            className="mt-1 h-6 text-xs w-28 inline-block ml-2"
                                                        />
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-right font-semibold">₹{fmt(currentHra)}</td>
                                            </tr>
                                            <tr>
                                                <td className="py-2 px-3 text-muted-foreground">
                                                    CONV (Conveyance Allow.)
                                                    <span className="ml-1 text-[9px] text-blue-600">
                                                        ({(calc?.present_salary || 0) > 25000 ? "20% of Present" : "10% of Present"})
                                                    </span>
                                                    {calc?.monthly_conveyance > 0 && (
                                                        <span className="block text-[9px] text-muted-foreground">Monthly: ₹{fmt(calc?.monthly_conveyance)}</span>
                                                    )}
                                                    {isEditable && (
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={convOverride !== null ? convOverride : baseConv}
                                                            onChange={(e) => setConvOverride(e.target.value === "" ? "" : Number(e.target.value))}
                                                            className="mt-1 h-6 text-xs w-28 inline-block ml-2"
                                                        />
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-right font-semibold">₹{fmt(currentConv)}</td>
                                            </tr>
                                            <tr className="bg-muted/20">
                                                <td className="py-2 px-3 text-muted-foreground">
                                                    Med Allow. (Medical)
                                                    <span className="ml-1 text-[9px] text-blue-600">
                                                        (5% of Present)
                                                    </span>
                                                    {calc?.monthly_medical > 0 && (
                                                        <span className="block text-[9px] text-muted-foreground">Monthly: ₹{fmt(calc?.monthly_medical)}</span>
                                                    )}
                                                    {isEditable && (
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={medOverride !== null ? medOverride : baseMed}
                                                            onChange={(e) => setMedOverride(e.target.value === "" ? "" : Number(e.target.value))}
                                                            className="mt-1 h-6 text-xs w-28 inline-block ml-2"
                                                        />
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-right font-semibold">₹{fmt(currentMed)}</td>
                                            </tr>

                                            {/* Gross Salary highlighted */}
                                            <tr className="bg-emerald-50 dark:bg-emerald-950/30 font-bold border-t-2 border-emerald-200">
                                                <td className="py-2.5 px-3 font-extrabold text-foreground">Gross Salary</td>
                                                <td className="py-2.5 px-3 text-right font-extrabold text-emerald-700 text-sm">₹{fmt(currentGross)}</td>
                                            </tr>

                                            {/* Additional Earnings */}
                                            <tr className="bg-blue-50/50 dark:bg-blue-950/20">
                                                <td className="py-1.5 px-3 text-[10px] font-bold text-blue-700 uppercase tracking-wider" colSpan={2}>
                                                    Additional Earnings
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="py-2 px-3 text-muted-foreground">
                                                    OT (Overtime)
                                                    {Number(calc?.total_ot_hours || 0) > 0 && (
                                                        <span className="ml-1 text-[9px] text-amber-700 dark:text-amber-300 font-semibold">
                                                            ({calc.total_ot_hours} hrs @ ₹{fmtInt(calc.present_salary)}/{calc.days_in_month}/12)
                                                        </span>
                                                    )}
                                                    {isEditable && (
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={editing ? overtime : baseOt}
                                                            onChange={(e) => setOvertime(e.target.value)}
                                                            className="mt-1 h-6 text-xs w-28 inline-block ml-2"
                                                        />
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-right font-semibold">₹{fmt(currentOt)}</td>
                                            </tr>
                                            <tr className="bg-muted/20">
                                                <td className="py-2 px-3 text-muted-foreground">
                                                    TA (Travel Allowance)
                                                    {isEditable && (
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={editing ? travelAllowance : baseTa}
                                                            onChange={(e) => setTravelAllowance(e.target.value)}
                                                            className="mt-1 h-6 text-xs w-28 inline-block ml-2"
                                                        />
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-right font-semibold">₹{fmt(currentTa)}</td>
                                            </tr>

                                            {/* Total Earnings highlighted */}
                                            <tr className="bg-emerald-100 dark:bg-emerald-900/40 border-t-2 border-emerald-300">
                                                <td className="py-2.5 px-3 font-extrabold text-foreground">Total Earnings</td>
                                                <td className="py-2.5 px-3 text-right font-extrabold text-emerald-800 dark:text-emerald-300 text-sm">
                                                    ₹{fmt(currentTotalEarnings)}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                {/* Deductions Side */}
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2">Attendance Summary</p>
                                    <table className="w-full text-xs border-collapse mb-4">
                                        <tbody className="divide-y divide-border/60">
                                            <tr className="bg-muted/20">
                                                <td className="py-1.5 px-3 text-muted-foreground">Absent Days (A)</td>
                                                <td className="py-1.5 px-3 text-right font-semibold text-rose-600">{att?.absent ?? 0} days <span className="text-[9px] text-muted-foreground font-normal">(Unpaid)</span></td>
                                            </tr>
                                            <tr>
                                                <td className="py-1.5 px-3 text-muted-foreground">Half Days (H)</td>
                                                <td className="py-1.5 px-3 text-right font-semibold text-amber-600">{att?.half_day ?? 0} days <span className="text-[9px] text-muted-foreground font-normal">(0.5 Unpaid)</span></td>
                                            </tr>
                                            <tr className="bg-rose-50/40 dark:bg-rose-950/20">
                                                <td className="py-1.5 px-3 text-muted-foreground flex items-center gap-1.5">
                                                    <span>Unpaid Leave (UL)</span>
                                                    <span className="text-[9px] font-bold text-rose-700 bg-rose-100 dark:bg-rose-950/60 px-1 rounded">Salary Cut</span>
                                                </td>
                                                <td className="py-1.5 px-3 text-right font-semibold text-rose-700">
                                                    {att?.unpaid_leave ?? 0} days <span className="text-[9px] font-normal">(Unpaid)</span>
                                                </td>
                                            </tr>
                                            <tr className="bg-teal-50/40 dark:bg-teal-950/20">
                                                <td className="py-1.5 px-3 text-muted-foreground flex items-center gap-1.5">
                                                    <span>Travel (TR)</span>
                                                    <span className="text-[9px] font-bold text-teal-700 bg-teal-100 dark:bg-teal-950/60 px-1 rounded">PAID</span>
                                                </td>
                                                <td className="py-1.5 px-3 text-right font-bold text-teal-700">
                                                    {att?.travel ?? 0} days &mdash; 100% Paid
                                                </td>
                                            </tr>
                                            <tr className="bg-blue-50/40 dark:bg-blue-950/20">
                                                <td className="py-1.5 px-3 text-muted-foreground flex items-center gap-1.5">
                                                    <span>Paid Leave (PL)</span>
                                                    <span className="text-[9px] font-bold text-blue-700 bg-blue-100 dark:bg-blue-950/60 px-1 rounded">PAID</span>
                                                </td>
                                                <td className="py-1.5 px-3 text-right font-bold text-blue-700">
                                                    {att?.paid_leave ?? 0} days &mdash; 100% Paid
                                                </td>
                                            </tr>
                                            <tr className="bg-emerald-50/50 dark:bg-emerald-950/20">
                                                <td className="py-1.5 px-3 text-muted-foreground flex items-center gap-1.5">
                                                    <span>Weekly Off (WO)</span>
                                                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/50 px-1 rounded">PAID</span>
                                                </td>
                                                <td className="py-1.5 px-3 text-right font-bold text-emerald-700">
                                                    {att?.weekly_off ?? 0} days &mdash; 100% Paid
                                                </td>
                                            </tr>
                                            <tr className="bg-emerald-50/50 dark:bg-emerald-950/20">
                                                <td className="py-1.5 px-3 text-muted-foreground flex items-center gap-1.5">
                                                    <span>Holiday (HOL)</span>
                                                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/50 px-1 rounded">PAID</span>
                                                </td>
                                                <td className="py-1.5 px-3 text-right font-bold text-emerald-700">
                                                    {att?.holiday ?? 0} days &mdash; 100% Paid
                                                </td>
                                            </tr>
                                            {(calc?.unmarked_days > 0) && (
                                                <tr className="bg-amber-50/50 dark:bg-amber-950/20">
                                                    <td className="py-1.5 px-3 text-muted-foreground">
                                                        Unmarked Days ({calc.unmarked_days} days)
                                                    </td>
                                                    <td className="py-1.5 px-3 text-right font-semibold text-amber-700">
                                                        {calc.unmarked_days} days <span className="text-[9px] font-normal">(Unpaid)</span>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>

                                    {/* Deductions Header */}
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2">Deductions</p>
                                    <table className="w-full text-xs border-collapse">
                                        <tbody className="divide-y divide-border/60">
                                            <tr>
                                                <td className="py-2 px-3 text-muted-foreground">
                                                    PF (Provident Fund)
                                                    {!isEditable && (
                                                        <span className="ml-1 text-[9px] text-muted-foreground">
                                                            {Number(calc?.monthly_basic ?? 0) > 25000
                                                                ? "(Fixed ₹3,000 — Basic > ₹25k)"
                                                                : "(12% of Basic)"}
                                                        </span>
                                                    )}
                                                    {isEditable && (
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={pfOverride !== null ? pfOverride : basePf}
                                                            onChange={(e) => setPfOverride(e.target.value === "" ? "" : Number(e.target.value))}
                                                            className="mt-1 h-6 text-xs w-28 inline-block ml-2"
                                                        />
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-right font-semibold text-red-600">
                                                    -₹{fmt(currentPf)}
                                                </td>
                                            </tr>
                                            <tr className="bg-muted/20">
                                                <td className="py-2 px-3 text-muted-foreground">
                                                    ESI
                                                    {!isEditable && (
                                                        <span className="ml-1 text-[9px] text-muted-foreground">(0.75% of Gross)</span>
                                                    )}
                                                    {isEditable && (
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={esiOverride !== null ? esiOverride : baseEsi}
                                                            onChange={(e) => setEsiOverride(e.target.value === "" ? "" : Number(e.target.value))}
                                                            className="mt-1 h-6 text-xs w-28 inline-block ml-2"
                                                        />
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-right font-semibold text-red-600">
                                                    -₹{fmt(currentEsi)}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="py-2 px-3 text-muted-foreground">
                                                    TDS
                                                    {!isEditable && (
                                                        <span className="ml-1 text-[9px] text-muted-foreground">({preview?.salary_config?.tds_percentage || 0}% of Gross)</span>
                                                    )}
                                                    {isEditable && (
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={tdsOverride !== null ? tdsOverride : baseTds}
                                                            onChange={(e) => setTdsOverride(e.target.value === "" ? "" : Number(e.target.value))}
                                                            className="mt-1 h-6 text-xs w-28 inline-block ml-2"
                                                        />
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-right font-semibold text-red-600">
                                                    -₹{fmt(currentTds)}
                                                </td>
                                            </tr>
                                            <tr className="bg-muted/20">
                                                <td className="py-2 px-3 text-muted-foreground">
                                                    Adv. Deduction
                                                    {isEditable && (
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={editing ? advanceDeduction : baseAdv}
                                                            onChange={(e) => setAdvanceDeduction(e.target.value)}
                                                            className="mt-1 h-6 text-xs w-28 inline-block ml-2"
                                                        />
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-right font-semibold text-red-600">-₹{fmt(currentAdv)}</td>
                                            </tr>
                                            {isEditable && (
                                                <tr>
                                                    <td className="py-2 px-3 text-muted-foreground">
                                                        Other Deductions
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={editing ? otherDeductions : baseOther}
                                                            onChange={(e) => setOtherDeductions(e.target.value)}
                                                            className="mt-1 h-6 text-xs w-28 inline-block ml-2"
                                                        />
                                                    </td>
                                                    <td className="py-2 px-3 text-right font-semibold text-red-600">-₹{fmt(currentOther)}</td>
                                                </tr>
                                            )}
                                            <tr className="bg-red-50 dark:bg-red-950/30 font-bold border-t-2 border-red-200">
                                                <td className="py-2.5 px-3 font-extrabold text-foreground">Total Deductions</td>
                                                <td className="py-2.5 px-3 text-right font-extrabold text-red-700 text-sm">
                                                    -₹{fmt(currentTotalDeductions)}
                                                </td>
                                            </tr>

                                            <tr>
                                                <td colSpan={2} className="py-2" />
                                            </tr>

                                            {/* Remarks */}
                                            {isEditable && (
                                                <tr>
                                                    <td colSpan={2} className="py-2 px-3">
                                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Remarks</Label>
                                                        <Input
                                                            placeholder="Optional remarks..."
                                                            value={remarks}
                                                            onChange={(e) => setRemarks(e.target.value)}
                                                            className="mt-1 h-7 text-xs"
                                                        />
                                                    </td>
                                                </tr>
                                            )}

                                            {/* NET PAYABLE */}
                                            <tr className="bg-[#183260] text-white">
                                                <td className="py-3 px-3 font-extrabold text-base">Final Payable Salary</td>
                                                <td className="py-3 px-3 text-right font-extrabold text-xl text-emerald-300">
                                                    ₹{fmt(currentNet)}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* ─── Previous Months History ─── */}
                        {previousSalaries.length > 0 && (
                            <div className="rounded-xl border border-border bg-card shadow-xs">
                                <div className="border-b border-border px-4 py-2.5 flex items-center gap-2">
                                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Previous Months Salary History</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs border-collapse">
                                        <thead>
                                            <tr className="border-b border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                <th className="p-2 pl-4">Month</th>
                                                <th className="p-2 text-right">Monthly Salary</th>
                                                <th className="p-2 text-center">Present Days</th>
                                                <th className="p-2 text-right">Basic Earned</th>
                                                <th className="p-2 text-right">Net Payable</th>
                                                <th className="p-2 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/60">
                                            {previousSalaries.slice(0, 6).map((s) => (
                                                <tr key={s.id} className="hover:bg-muted/30 transition">
                                                    <td className="p-2 pl-4 font-semibold text-foreground">{MONTH_NAMES[s.month - 1]} {s.year}</td>
                                                    <td className="p-2 text-right text-muted-foreground">₹{fmt(s.present_salary)}</td>
                                                    <td className="p-2 text-center font-semibold text-emerald-700">{s.present_days}</td>
                                                    <td className="p-2 text-right text-muted-foreground">₹{fmt(s.basic_salary)}</td>
                                                    <td className="p-2 text-right font-bold text-foreground">₹{fmt(s.net_salary)}</td>
                                                    <td className="p-2 text-center">
                                                        <span className={cn(
                                                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                                                            s.payment_status === "Paid" ? "bg-emerald-100 text-emerald-800" :
                                                            s.payment_status === "Approved" ? "bg-blue-100 text-blue-800" :
                                                            "bg-muted text-foreground"
                                                        )}>
                                                            {s.payment_status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ─── Action Buttons ─── */}
                        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                            {!isFinalized && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditing(!editing)}
                                    className={cn("text-xs gap-1.5", editing && "border-blue-500 text-blue-700 bg-blue-50")}
                                >
                                    <Edit2 className="h-3.5 w-3.5" />
                                    {editing ? "Cancel Edit" : "Edit"}
                                </Button>
                            )}

                            {!isFinalized && (
                                <Button
                                    size="sm"
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                                >
                                    <Save className="h-3.5 w-3.5" />
                                    {saving ? "Saving..." : isAlreadySaved ? "Update Salary" : "Save Salary"}
                                </Button>
                            )}

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePrint}
                                className="text-xs gap-1.5 ml-auto"
                            >
                                <Printer className="h-3.5 w-3.5" />
                                Print Salary Slip
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDownloadPDF}
                                className="text-xs gap-1.5"
                            >
                                <Download className="h-3.5 w-3.5" />
                                Download PDF
                            </Button>
                        </div>
                    </div>
                )}

                {/* ─── PRINTABLE SALARY SLIP (hidden) ─── */}
                <div className="hidden">
                    <div ref={printRef}>
                        <div className="slip-wrap" style={{ maxWidth: "760px", margin: "0 auto", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", fontFamily: "Arial, sans-serif" }}>
                            {/* Slip Header */}
                            <div style={{ background: "#183260", color: "white", padding: "16px 20px", display: "flex", alignItems: "center", gap: "16px" }}>
                                <img src={jbEngineeringLogo} alt="JB Engineering" style={{ height: "48px", borderRadius: "4px" }} />
                                <div>
                                    <div style={{ fontSize: "18px", fontWeight: "bold" }}>JB Engineering</div>
                                    <div style={{ fontSize: "12px", opacity: 0.8 }}>
                                        SALARY SLIP — {MONTH_NAMES[(month || 1) - 1].toUpperCase()} {year}
                                    </div>
                                </div>
                                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                                    <div style={{ fontSize: "11px", opacity: 0.7 }}>Payment Status</div>
                                    <div style={{ fontSize: "13px", fontWeight: "bold", background: "rgba(255,255,255,0.15)", padding: "2px 10px", borderRadius: "9999px", marginTop: "2px" }}>
                                        {existingStatus || "PREVIEW"}
                                    </div>
                                </div>
                            </div>

                            {/* Employee Details */}
                            <div style={{ padding: "12px 20px", borderBottom: "1px solid #e2e8f0" }}>
                                <div style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", color: "#64748b", marginBottom: "8px" }}>Employee Information</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "6px 24px" }}>
                                    {[
                                        ["Employee Name", emp?.name || employee?.name],
                                        ["Employee Code", emp?.employee_code || employee?.employee_code],
                                        ["Designation", emp?.designation || employee?.designation || "—"],
                                        ["Location", emp?.location || employee?.location || "—"],
                                        ["Date of Joining", emp?.date_of_joining ? new Date(emp.date_of_joining).toLocaleDateString("en-IN") : "—"],
                                        ["Starting Salary", `₹${fmt(emp?.starting_salary)}`],
                                        ["Current Salary", `₹${fmt(emp?.present_salary)}`],
                                        ["Salary Month", `${MONTH_NAMES[(month || 1) - 1]} ${year}`],
                                    ].map(([label, val]) => (
                                        <div key={label}>
                                            <div style={{ fontSize: "9px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
                                            <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>{val}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Attendance Summary */}
                            <div style={{ padding: "12px 20px", borderBottom: "1px solid #e2e8f0" }}>
                                <div style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", color: "#64748b", marginBottom: "8px" }}>Attendance Summary</div>
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead>
                                        <tr style={{ background: "#f8fafc" }}>
                                            {["Calendar Days", "Present (P)", "Travel (TR)", "Absent (A)", "Half Day (H)", "Half Day (HD)", "Paid Leave (PL)", "Unpaid Leave (UL)", "Weekly Off (Paid)", "Holiday (Paid)", "Total Paid Days"].map(h => (
                                                <th key={h} style={{ padding: "5px 8px", border: "1px solid #e2e8f0", fontSize: "10px", textAlign: "center", fontWeight: 700, color: "#334155" }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            {[
                                                att?.total_calendar_days,
                                                att?.present,
                                                (att?.travel ?? 0),
                                                att?.absent,
                                                att?.half_day,
                                                (att?.half_day_paid ?? 0),
                                                att?.paid_leave,
                                                (att?.unpaid_leave ?? 0),
                                                att?.weekly_off,
                                                att?.holiday,
                                                (att?.total_paid_days ?? att?.total_present_days)
                                            ].map((v, i) => (
                                                <td key={i} style={{ padding: "5px 8px", border: "1px solid #e2e8f0", fontSize: "12px", textAlign: "center", fontWeight: (i === 2 || i >= 7) ? 800 : 600, color: i === 9 ? "#183260" : (i === 2 || i >= 7) ? "#166534" : "#1e293b" }}>{v ?? 0}</td>
                                            ))}
                                        </tr>
                                    </tbody>
                                </table>
                                <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>
                                    Note: Travel (TR), Paid Leave (PL), Weekly Offs (WO), and Holidays (HOL) are 100% paid days (no salary deduction). Unpaid Leave (UL) is deducted.
                                </div>
                            </div>

                            {/* Salary Breakdown */}
                            <div style={{ padding: "12px 20px", borderBottom: "1px solid #e2e8f0" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
                                    {/* Earnings */}
                                    <div>
                                        <div style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", color: "#64748b", marginBottom: "6px" }}>Earnings</div>
                                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                            <tbody>
                                                {[
                                                    ["Monthly Salary", `₹${fmt(calc?.present_salary)}`],
                                                    ["Per Day Salary", `₹${fmt(perDay)}`],
                                                    [`Total Paid Days (${att?.total_paid_days ?? att?.total_present_days ?? 0} days)`, ""],
                                                ].map(([label, val], i) => (
                                                    <tr key={label} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                                                        <td style={{ padding: "4px 8px", border: "1px solid #e2e8f0", fontSize: "11px", color: "#64748b" }}>{label}</td>
                                                        <td style={{ padding: "4px 8px", border: "1px solid #e2e8f0", fontSize: "11px", textAlign: "right", fontWeight: 600 }}>{val}</td>
                                                    </tr>
                                                ))}
                                                {/* Basic Salary Structure */}
                                                <tr style={{ background: "#eff6ff" }}>
                                                    <td colSpan={2} style={{ padding: "3px 8px", border: "1px solid #e2e8f0", fontSize: "10px", fontWeight: 700, color: "#1d4ed8" }}>Basic Salary Breakdown</td>
                                                </tr>
                                                {[
                                                    ["Basic Salary", `₹${fmt(currentBasic)}`],
                                                    ["HRA", `₹${fmt(currentHra)}`],
                                                    ["CONV (Conveyance)", `₹${fmt(currentConv)}`],
                                                    ["Med Allow. (Medical)", `₹${fmt(currentMed)}`],
                                                ].map(([label, val], i) => (
                                                    <tr key={label} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                                                        <td style={{ padding: "4px 8px", border: "1px solid #e2e8f0", fontSize: "11px", color: "#64748b" }}>{label}</td>
                                                        <td style={{ padding: "4px 8px", border: "1px solid #e2e8f0", fontSize: "11px", textAlign: "right", fontWeight: 600 }}>{val}</td>
                                                    </tr>
                                                ))}
                                                <tr style={{ background: "#dcfce7" }}>
                                                    <td style={{ padding: "5px 8px", border: "1px solid #e2e8f0", fontSize: "12px", fontWeight: 800 }}>Gross Salary</td>
                                                    <td style={{ padding: "5px 8px", border: "1px solid #e2e8f0", fontSize: "12px", fontWeight: 800, textAlign: "right", color: "#166534" }}>₹{fmt(currentGross)}</td>
                                                </tr>
                                                {/* Additional earnings */}
                                                {Number(currentOt) > 0 && (
                                                    <tr style={{ background: "#f8fafc" }}>
                                                        <td style={{ padding: "4px 8px", border: "1px solid #e2e8f0", fontSize: "11px", color: "#64748b" }}>
                                                            OT (Overtime){Number(calc?.total_ot_hours || 0) > 0 ? ` (${calc.total_ot_hours} hrs)` : ""}
                                                        </td>
                                                        <td style={{ padding: "4px 8px", border: "1px solid #e2e8f0", fontSize: "11px", textAlign: "right", fontWeight: 600 }}>₹{fmt(currentOt)}</td>
                                                    </tr>
                                                )}
                                                {Number(currentTa) > 0 && (
                                                    <tr style={{ background: "white" }}>
                                                        <td style={{ padding: "4px 8px", border: "1px solid #e2e8f0", fontSize: "11px", color: "#64748b" }}>TA (Travel Allowance)</td>
                                                        <td style={{ padding: "4px 8px", border: "1px solid #e2e8f0", fontSize: "11px", textAlign: "right", fontWeight: 600 }}>₹{fmt(currentTa)}</td>
                                                    </tr>
                                                )}
                                                {(Number(currentOt) > 0 || Number(currentTa) > 0) && (
                                                    <tr style={{ background: "#d1fae5" }}>
                                                        <td style={{ padding: "5px 8px", border: "1px solid #e2e8f0", fontSize: "12px", fontWeight: 800 }}>Total Earnings</td>
                                                        <td style={{ padding: "5px 8px", border: "1px solid #e2e8f0", fontSize: "12px", fontWeight: 800, textAlign: "right", color: "#065f46" }}>
                                                            ₹{fmt(currentTotalEarnings)}
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    {/* Deductions */}
                                    <div>
                                        <div style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", color: "#64748b", marginBottom: "6px" }}>Deductions</div>
                                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                            <tbody>
                                                {[
                                                    [Number(calc?.monthly_basic ?? 0) > 25000 ? "PF (Provident Fund) — Fixed" : "PF (Provident Fund)", `-₹${fmt(currentPf)}`],
                                                    ["ESI (0.75% of Gross)", `-₹${fmt(currentEsi)}`],
                                                    ["TDS", `-₹${fmt(currentTds)}`],
                                                    ["Adv. Deduction", `-₹${fmt(currentAdv)}`],
                                                    ...(Number(otherDeductions) > 0 ? [["Other Deductions", `-₹${fmt(currentOther)}`]] : []),
                                                ].map(([label, val], i) => (
                                                    <tr key={label} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                                                        <td style={{ padding: "4px 8px", border: "1px solid #e2e8f0", fontSize: "11px", color: "#64748b" }}>{label}</td>
                                                        <td style={{ padding: "4px 8px", border: "1px solid #e2e8f0", fontSize: "11px", textAlign: "right", fontWeight: 600, color: "#dc2626" }}>{val}</td>
                                                    </tr>
                                                ))}
                                                <tr style={{ background: "#fee2e2" }}>
                                                    <td style={{ padding: "5px 8px", border: "1px solid #e2e8f0", fontSize: "12px", fontWeight: 800 }}>Total Deductions</td>
                                                    <td style={{ padding: "5px 8px", border: "1px solid #e2e8f0", fontSize: "12px", fontWeight: 800, textAlign: "right", color: "#dc2626" }}>-₹{fmt(currentTotalDeductions)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            {/* Net Salary */}
                            <div style={{ background: "#183260", color: "white", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ fontSize: "15px", fontWeight: 900 }}>Net Payable Salary</div>
                                <div style={{ fontSize: "22px", fontWeight: 900, color: "#6ee7b7" }}>₹{fmt(currentNet)}</div>
                            </div>

                            {/* Footer */}
                            <div style={{ padding: "10px 20px", background: "#f8fafc", display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#94a3b8", borderTop: "1px solid #e2e8f0" }}>
                                <span>Generated by JB Engineering HR System</span>
                                <span>This is a computer-generated salary slip.</span>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
