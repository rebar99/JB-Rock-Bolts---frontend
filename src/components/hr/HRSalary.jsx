import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    IndianRupee,
    Search,
    Calendar,
    CheckCircle2,
    Clock,
    AlertCircle,
    Eye,
    Printer,
    Download,
    Check,
    CreditCard,
    Building2,
    Settings,
    FileSpreadsheet,
    FileText,
    History,
    PlusCircle,
    UploadCloud,
    X,
    TrendingUp,
    ShieldAlert,
    PauseCircle,
} from "lucide-react";
import {
    fetchHRSalaries,
    fetchHRSalary,
    generateHRSalary,
    updateHRSalary,
    approveHRSalary,
    markHRSalaryPaid,
    holdHRSalary,
    fetchHRSalarySlip,
    uploadHRSalaryProof,
    fetchHREmployees,
    fetchHRAttendanceCloseStatus,
    fetchHRSalaryConfig,
    updateHRSalaryConfig,
    resolveFileUrl,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import jbEngineeringLogo from "@/assets/jb-engineering-logo.jpg";

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

export default function HRSalary() {
    const queryClient = useQueryClient();
    const printRef = useRef(null);

    // Active sub-tab
    const [activeTab, setActiveTab] = useState("generate"); // "generate", "history", "config"

    const today = new Date();
    const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(today.getFullYear());
    const [statusFilter, setStatusFilter] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");

    // Generate Dialog state
    const [generateModalOpen, setGenerateModalOpen] = useState(false);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
    const [overtimeAmount, setOvertimeAmount] = useState(0);
    const [allowancesAmount, setAllowancesAmount] = useState(0);
    const [bonusAmount, setBonusAmount] = useState(0);
    const [advanceDeduction, setAdvanceDeduction] = useState(0);
    const [otherDeductions, setOtherDeductions] = useState(0);
    const [salaryRemarks, setSalaryRemarks] = useState("");
    const [generating, setGenerating] = useState(false);

    // Mark as Paid Dialog
    const [markPaidModalOpen, setMarkPaidModalOpen] = useState(false);
    const [payingSalary, setPayingSalary] = useState(null);
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
    const [paymentMode, setPaymentMode] = useState("Bank Transfer");
    const [transactionRef, setTransactionRef] = useState("");
    const [paymentRemarks, setPaymentRemarks] = useState("");
    const [proofFile, setProofFile] = useState(null);
    const [payingAction, setPayingAction] = useState(false);

    // Salary Details / Slip Dialog
    const [slipModalOpen, setSlipModalOpen] = useState(false);
    const [slipData, setSlipData] = useState(null);

    // Config editing state
    const [configValues, setConfigValues] = useState({});

    // Check attendance close status for selected month/year
    const { data: closeStatus } = useQuery({
        queryKey: ["hr-attendance-close-status", selectedMonth, selectedYear],
        queryFn: () => fetchHRAttendanceCloseStatus(selectedMonth, selectedYear),
        staleTime: 0,           // always re-fetch when month/year changes
        refetchOnWindowFocus: true,
    });

    const isAttendanceClosed = Boolean(closeStatus?.is_closed);

    // Query active employees for generate dropdown - Safe Array
    const { data: rawActiveEmployees = [] } = useQuery({
        queryKey: ["hr-active-employees"],
        queryFn: () => fetchHREmployees({ is_active: true }),
    });
    const activeEmployees = useMemo(() => (Array.isArray(rawActiveEmployees) ? rawActiveEmployees : []), [rawActiveEmployees]);

    // Query salary records - Safe Array
    const { data: rawSalaryList = [], isLoading } = useQuery({
        queryKey: ["hr-salaries", selectedMonth, selectedYear, statusFilter],
        queryFn: () =>
            fetchHRSalaries({
                month: selectedMonth,
                year: selectedYear,
                status: statusFilter === "all" ? undefined : statusFilter,
            }),
    });
    const salaryList = useMemo(() => (Array.isArray(rawSalaryList) ? rawSalaryList : []), [rawSalaryList]);

    // Query payroll config
    const { data: salaryConfig, refetch: refetchConfig } = useQuery({
        queryKey: ["hr-salary-config"],
        queryFn: fetchHRSalaryConfig,
        onSuccess: (data) => setConfigValues(data || {}),
    });

    // Filter salary list by search
    const filteredSalaries = useMemo(() => {
        if (!searchTerm.trim()) return salaryList;
        const lower = searchTerm.toLowerCase();
        return salaryList.filter(
            (s) =>
                s.employee_name?.toLowerCase().includes(lower) ||
                s.employee_code?.toLowerCase().includes(lower) ||
                s.designation?.toLowerCase().includes(lower) ||
                s.transaction_ref?.toLowerCase().includes(lower)
        );
    }, [salaryList, searchTerm]);

    const handleOpenGenerate = () => {
        if (!isAttendanceClosed) {
            toast.error(
                `Attendance for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} is NOT closed yet! Please verify & close attendance first in the Attendance module.`
            );
            return;
        }
        setSelectedEmployeeId(activeEmployees[0]?.id ? String(activeEmployees[0].id) : "");
        setOvertimeAmount(0);
        setAllowancesAmount(0);
        setBonusAmount(0);
        setAdvanceDeduction(0);
        setOtherDeductions(0);
        setSalaryRemarks("");
        setGenerateModalOpen(true);
    };

    const handleGenerateSalary = async (e) => {
        e.preventDefault();
        if (!selectedEmployeeId) {
            toast.error("Please select an employee");
            return;
        }

        setGenerating(true);
        try {
            await generateHRSalary({
                employee_id: Number(selectedEmployeeId),
                month: selectedMonth,
                year: selectedYear,
                overtime_amount: Number(overtimeAmount || 0),
                allowances: Number(allowancesAmount || 0),
                bonus: Number(bonusAmount || 0),
                advance_deduction: Number(advanceDeduction || 0),
                other_deductions: Number(otherDeductions || 0),
                remarks: salaryRemarks,
            });
            toast.success("Salary generated successfully!");
            setGenerateModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["hr-salaries"] });
            queryClient.invalidateQueries({ queryKey: ["hr-dashboard"] });
        } catch (err) {
            toast.error(err.message || "Failed to generate salary");
        } finally {
            setGenerating(false);
        }
    };

    const handleApprove = async (sal) => {
        try {
            await approveHRSalary(sal.id);
            toast.success(`Salary for ${sal.employee_name} approved!`);
            queryClient.invalidateQueries({ queryKey: ["hr-salaries"] });
            queryClient.invalidateQueries({ queryKey: ["hr-dashboard"] });
        } catch (err) {
            toast.error(err.message || "Failed to approve salary");
        }
    };

    const handleHold = async (sal) => {
        try {
            await holdHRSalary(sal.id);
            toast.info(`Salary for ${sal.employee_name} put On Hold`);
            queryClient.invalidateQueries({ queryKey: ["hr-salaries"] });
            queryClient.invalidateQueries({ queryKey: ["hr-dashboard"] });
        } catch (err) {
            toast.error(err.message || "Failed to hold salary");
        }
    };

    const handleOpenMarkPaid = (sal) => {
        setPayingSalary(sal);
        setPaymentDate(new Date().toISOString().split("T")[0]);
        setPaymentMode("Bank Transfer");
        setTransactionRef("");
        setPaymentRemarks("");
        setProofFile(null);
        setMarkPaidModalOpen(true);
    };

    const handleConfirmMarkPaid = async (e) => {
        e.preventDefault();
        if (!payingSalary) return;
        setPayingAction(true);
        try {
            await markHRSalaryPaid(payingSalary.id, {
                payment_date: paymentDate,
                payment_mode: paymentMode,
                transaction_ref: transactionRef,
                remarks: paymentRemarks,
            });

            if (proofFile) {
                await uploadHRSalaryProof(payingSalary.id, proofFile).catch(() => {});
            }

            toast.success(`Salary marked as PAID for ${payingSalary.employee_name}!`);
            setMarkPaidModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["hr-salaries"] });
            queryClient.invalidateQueries({ queryKey: ["hr-dashboard"] });
        } catch (err) {
            toast.error(err.message || "Failed to mark salary as paid");
        } finally {
            setPayingAction(false);
        }
    };

    const handleOpenSlip = async (sal) => {
        try {
            const data = await fetchHRSalarySlip(sal.id);
            setSlipData(data?.slip || null);
            setSlipModalOpen(true);
        } catch (err) {
            toast.error(err.message || "Failed to fetch salary slip");
        }
    };

    const handlePrintSlip = () => {
        const content = printRef.current;
        if (!content) return;
        const printWindow = window.open("", "_blank");
        printWindow.document.write(`
            <html>
                <head>
                    <title>Salary Slip - ${slipData?.employee_name}</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; }
                        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
                        th, td { border: 1px solid #cbd5e1; padding: 6px 10px; font-size: 12px; }
                        th { background-color: #f1f5f9; text-align: left; }
                        .text-right { text-align: right; }
                        .font-bold { font-weight: bold; }
                        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #183260; padding-bottom: 12px; }
                        .title { font-size: 20px; font-weight: bold; color: #183260; }
                        .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: bold; }
                        .badge-paid { background: #dcfce7; color: #166534; }
                    </style>
                </head>
                <body>
                    ${content.innerHTML}
                    <script>window.print(); window.close();</script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const handleExportRegisterCSV = () => {
        if (!filteredSalaries.length) {
            toast.error("No salary records to export");
            return;
        }

        const headers = [
            "S.No",
            "Emp Code",
            "Employee Name",
            "Designation",
            "Month",
            "Present Salary",
            "Present Days",
            "Basic Salary",
            "Overtime",
            "Allowances",
            "Bonus",
            "Gross Salary",
            "Deductions",
            "Net Payable",
            "Status",
            "Payment Date",
            "Payment Mode",
            "Transaction Ref",
        ];

        const rows = filteredSalaries.map((s, idx) => [
            idx + 1,
            `"${s.employee_code}"`,
            `"${s.employee_name}"`,
            `"${s.designation || ""}"`,
            `"${MONTH_NAMES[s.month - 1]} ${s.year}"`,
            s.present_salary,
            s.present_days,
            s.basic_salary,
            s.overtime_amount,
            s.allowances,
            s.bonus,
            s.gross_salary,
            s.total_deductions,
            s.net_salary,
            `"${s.payment_status}"`,
            s.payment_date || "—",
            `"${s.payment_mode || "—"}"`,
            `"${s.transaction_ref || "—"}"`,
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Salary_Register_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSaveConfig = async (e) => {
        e.preventDefault();
        try {
            await updateHRSalaryConfig({ configs: configValues });
            toast.success("Payroll calculation rules updated successfully!");
            refetchConfig();
        } catch (err) {
            toast.error(err.message || "Failed to update salary config");
        }
    };

    return (
        <div className="space-y-4">
            {/* Header: Title and Tab Switchers */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3.5">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Salary Management</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Generate monthly payroll from verified attendance, approve, pay, and generate professional salary slips.
                    </p>
                </div>

                <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-1 text-xs">
                    <button
                        type="button"
                        onClick={() => setActiveTab("generate")}
                        className={cn(
                            "rounded-md px-3 py-1.5 font-semibold transition",
                            activeTab === "generate"
                                ? "bg-background text-foreground shadow-xs font-bold"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Payroll Processing
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("history")}
                        className={cn(
                            "rounded-md px-3 py-1.5 font-semibold transition",
                            activeTab === "history"
                                ? "bg-background text-foreground shadow-xs font-bold"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Payment Register
                    </button>
                </div>
            </div>

            {/* TAB 1: PAYROLL PROCESSING & GENERATION */}
            {activeTab === "generate" && (
                <div className="space-y-4">
                    {!isAttendanceClosed ? (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-4 text-amber-900 dark:text-amber-200 flex items-start gap-3 shadow-xs">
                            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <h3 className="text-sm font-bold">Attendance Not Closed for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}</h3>
                                <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                                    Salary generation requires attendance to be verified and locked first. Please go to the <b>Attendance</b> tab and click <b>Verify & Close Attendance</b> to enable salary generation.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-3.5 text-emerald-900 dark:text-emerald-200 flex items-center gap-2 shadow-xs">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            <span className="text-xs font-semibold">
                                Attendance verified & locked for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}. Ready to process payroll.
                            </span>
                        </div>
                    )}

                    {/* Filter controls: Month, Year, Status, Search */}
                    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 bg-card p-3 rounded-xl border border-border shadow-xs text-xs">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Salary Month</label>
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground font-medium focus:ring-1 focus:ring-primary"
                            >
                                {MONTH_NAMES.map((name, idx) => (
                                    <option key={name} value={idx + 1}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Salary Year</label>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground font-medium focus:ring-1 focus:ring-primary"
                            >
                                {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                                    <option key={y} value={y}>
                                        {y}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Payment Status</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:ring-1 focus:ring-primary"
                            >
                                <option value="all">All Statuses</option>
                                <option value="Pending">Pending</option>
                                <option value="Approved">Approved</option>
                                <option value="Paid">Paid</option>
                                <option value="On Hold">On Hold</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Search Employee</label>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Name or code..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8 text-xs h-8 bg-background"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Payroll Table - Full width */}
                    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-[11px] font-bold uppercase tracking-wider select-none border-b border-slate-300 dark:border-slate-700">
                                        <th className="p-3 pl-4">S.No</th>
                                        <th className="p-3">Code</th>
                                        <th className="p-3">Employee Name</th>
                                        <th className="p-3">Designation</th>
                                        <th className="p-3 text-right">Present Salary</th>
                                        <th className="p-3 text-center">Days (P / L / A)</th>
                                        <th className="p-3 text-right">Basic Earned</th>
                                        <th className="p-3 text-right">Deductions</th>
                                        <th className="p-3 text-right font-black">Net Payable</th>
                                        <th className="p-3 text-center">Status</th>
                                        <th className="p-3 pr-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={11} className="p-8 text-center text-muted-foreground">
                                                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                                <p className="mt-2 text-xs">Loading payroll...</p>
                                            </td>
                                        </tr>
                                    ) : filteredSalaries.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} className="p-8 text-center text-muted-foreground">
                                                <IndianRupee className="mx-auto h-8 w-8 text-muted-foreground/40" />
                                                <p className="mt-2 text-sm font-semibold text-foreground">No salary records generated</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {isAttendanceClosed
                                                        ? "Generate payroll from the Attendance register for each employee."
                                                        : "Attendance must be verified & closed first."}
                                                </p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredSalaries.map((sal, idx) => {
                                            const statusStyle =
                                                sal.payment_status === "Paid"
                                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                                    : sal.payment_status === "Approved"
                                                    ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                                    : sal.payment_status === "On Hold"
                                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                                    : "bg-muted text-foreground";

                                            return (
                                                <tr key={sal.id} className="transition hover:bg-muted/30">
                                                    <td className="p-3 pl-4 text-muted-foreground">{idx + 1}</td>
                                                    <td className="p-3 font-mono font-bold text-[#183260] dark:text-cyan-400">{sal.employee_code}</td>
                                                    <td className="p-3 font-semibold text-foreground">{sal.employee_name}</td>
                                                    <td className="p-3 text-muted-foreground">{sal.designation || "—"}</td>
                                                    <td className="p-3 text-right font-medium text-foreground">
                                                        ₹{Number(sal.present_salary || 0).toLocaleString("en-IN")}
                                                    </td>
                                                    <td className="p-3 text-center text-muted-foreground">
                                                        <span className="text-emerald-700 font-bold">{sal.present_days}</span> /{" "}
                                                        <span className="text-blue-700">{sal.paid_leave_days}</span> /{" "}
                                                        <span className="text-red-700">{sal.absent_days}</span>
                                                    </td>
                                                    <td className="p-3 text-right text-foreground font-medium">
                                                        ₹{Number(sal.basic_salary || 0).toLocaleString("en-IN")}
                                                    </td>
                                                    <td className="p-3 text-right text-destructive">
                                                        -₹{Number(sal.total_deductions || 0).toLocaleString("en-IN")}
                                                    </td>
                                                    <td className="p-3 text-right font-extrabold text-foreground text-sm">
                                                        ₹{Number(sal.net_salary || 0).toLocaleString("en-IN")}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", statusStyle)}>
                                                            {sal.payment_status}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 pr-4 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={() => handleOpenSlip(sal)}
                                                                className="h-7 w-7 text-muted-foreground hover:text-blue-600 hover:bg-blue-50"
                                                                title="View Salary Slip"
                                                            >
                                                                <FileText className="h-3.5 w-3.5" />
                                                            </Button>

                                                            {sal.payment_status === "Pending" && (
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    onClick={() => handleApprove(sal)}
                                                                    className="h-7 w-7 text-muted-foreground hover:text-blue-600 hover:bg-blue-50"
                                                                    title="Approve Salary"
                                                                >
                                                                    <Check className="h-3.5 w-3.5" />
                                                                </Button>
                                                            )}

                                                            {sal.payment_status !== "Paid" && (
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    onClick={() => handleOpenMarkPaid(sal)}
                                                                    className="h-7 w-7 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50"
                                                                    title="Mark as Paid"
                                                                >
                                                                    <CreditCard className="h-3.5 w-3.5" />
                                                                </Button>
                                                            )}

                                                            {sal.payment_status !== "Paid" && sal.payment_status !== "On Hold" && (
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    onClick={() => handleHold(sal)}
                                                                    className="h-7 w-7 text-muted-foreground hover:text-amber-600 hover:bg-amber-50"
                                                                    title="Put On Hold"
                                                                >
                                                                    <PauseCircle className="h-3.5 w-3.5" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: COMPLETE SALARY PAYMENT HISTORY / REGISTER */}
            {activeTab === "history" && (
                <div className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card p-3 rounded-xl border border-border">
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                            <span className="font-bold text-foreground">Filters:</span>
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                            >
                                {MONTH_NAMES.map((name, idx) => (
                                    <option key={name} value={idx + 1}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                            >
                                {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                                    <option key={y} value={y}>
                                        {y}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                            >
                                <option value="all">All Statuses</option>
                                <option value="Paid">Paid Only</option>
                                <option value="Pending">Pending</option>
                                <option value="On Hold">On Hold</option>
                            </select>
                        </div>

                        <Button size="sm" variant="outline" onClick={handleExportRegisterCSV} className="text-xs">
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            Download Register (Excel)
                        </Button>
                    </div>

                    {/* Payment Register Table */}
                    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-[11px] font-bold uppercase tracking-wider select-none border-b border-slate-300 dark:border-slate-700">
                                        <th className="p-3 pl-4">S.No</th>
                                        <th className="p-3">Emp Code</th>
                                        <th className="p-3">Employee Name</th>
                                        <th className="p-3">Designation</th>
                                        <th className="p-3">Salary Month</th>
                                        <th className="p-3 text-right">Net Salary</th>
                                        <th className="p-3">Payment Date</th>
                                        <th className="p-3">Payment Mode</th>
                                        <th className="p-3">Transaction ID / Ref</th>
                                        <th className="p-3 text-center">Status</th>
                                        <th className="p-3 pr-4 text-center">Slip</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {filteredSalaries.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} className="p-8 text-center text-muted-foreground">
                                                No records in payment history for this filter.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredSalaries.map((sal, idx) => (
                                            <tr key={sal.id} className="hover:bg-muted/30">
                                                <td className="p-3 pl-4 text-muted-foreground">{idx + 1}</td>
                                                <td className="p-3 font-mono font-bold text-[#183260] dark:text-cyan-400">{sal.employee_code}</td>
                                                <td className="p-3 font-semibold text-foreground">{sal.employee_name}</td>
                                                <td className="p-3 text-muted-foreground">{sal.designation || "—"}</td>
                                                <td className="p-3 text-muted-foreground">{MONTH_NAMES[sal.month - 1]} {sal.year}</td>
                                                <td className="p-3 text-right font-bold text-foreground">
                                                    ₹{Number(sal.net_salary || 0).toLocaleString("en-IN")}
                                                </td>
                                                <td className="p-3 text-foreground">
                                                    {sal.payment_date ? new Date(sal.payment_date).toLocaleDateString("en-IN") : "—"}
                                                </td>
                                                <td className="p-3 text-foreground">{sal.payment_mode || "—"}</td>
                                                <td className="p-3 font-mono text-[11px] text-muted-foreground">{sal.transaction_ref || "—"}</td>
                                                <td className="p-3 text-center">
                                                    <span
                                                        className={cn(
                                                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                                                            sal.payment_status === "Paid"
                                                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                                                : "bg-muted text-foreground"
                                                        )}
                                                    >
                                                        {sal.payment_status}
                                                    </span>
                                                </td>
                                                <td className="p-3 pr-4 text-center">
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        onClick={() => handleOpenSlip(sal)}
                                                        className="h-7 w-7 text-muted-foreground hover:text-blue-600 hover:bg-blue-50"
                                                        title="View Slip"
                                                    >
                                                        <FileText className="h-3.5 w-3.5" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: CONFIGURABLE SALARY RULES */}
            {activeTab === "config" && (
                <div className="max-w-2xl bg-card p-6 rounded-xl border border-border shadow-xs space-y-5">
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Configurable Payroll Rules</h2>
                        <p className="text-xs text-muted-foreground mt-1">
                            Modify standard working days, half-day deduction factors, and statutory deduction percentages instead of hardcoding formulas.
                        </p>
                    </div>

                    <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
                        <div>
                            <Label className="text-xs">Standard Working Days per Month</Label>
                            <Input
                                type="number"
                                min="1"
                                max="31"
                                value={configValues.working_days_per_month ?? "26"}
                                onChange={(e) => setConfigValues({ ...configValues, working_days_per_month: e.target.value })}
                                className="h-8 text-xs bg-background mt-1"
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">Used as denominator (Present Salary ÷ Working Days) for per-day rate.</p>
                        </div>

                        <div>
                            <Label className="text-xs">Half Day Rate Factor (0.0 to 1.0)</Label>
                            <Input
                                type="number"
                                step="0.1"
                                min="0"
                                max="1"
                                value={configValues.half_day_factor ?? "0.5"}
                                onChange={(e) => setConfigValues({ ...configValues, half_day_factor: e.target.value })}
                                className="h-8 text-xs bg-background mt-1"
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">Default 0.5 (half day counts as 50% salary).</p>
                        </div>

                        <div>
                            <Label className="text-xs">Overtime Rate per Hour (₹)</Label>
                            <Input
                                type="number"
                                min="0"
                                value={configValues.overtime_rate_per_hour ?? "0"}
                                onChange={(e) => setConfigValues({ ...configValues, overtime_rate_per_hour: e.target.value })}
                                className="h-8 text-xs bg-background mt-1"
                            />
                        </div>

                        <div>
                            <Label className="text-xs">Provident Fund (PF) Deduction %</Label>
                            <Input
                                type="number"
                                min="0"
                                max="100"
                                value={configValues.pf_percentage ?? "0"}
                                onChange={(e) => setConfigValues({ ...configValues, pf_percentage: e.target.value })}
                                className="h-8 text-xs bg-background mt-1"
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">Set to 0 if PF is not deducted.</p>
                        </div>

                        <div>
                            <Label className="text-xs">ESI Deduction %</Label>
                            <Input
                                type="number"
                                min="0"
                                max="100"
                                value={configValues.esi_percentage ?? "0"}
                                onChange={(e) => setConfigValues({ ...configValues, esi_percentage: e.target.value })}
                                className="h-8 text-xs bg-background mt-1"
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">Set to 0 if ESI is not deducted.</p>
                        </div>

                        <Button type="submit" className="bg-[#183260] hover:bg-[#122548] text-white font-semibold">
                            Save Calculation Rules
                        </Button>
                    </form>
                </div>
            )}

            {/* GENERATE SALARY MODAL */}
            <Dialog open={generateModalOpen} onOpenChange={setGenerateModalOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-foreground">
                            Generate Salary for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Select an employee to fetch their verified attendance and compute net payable salary.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleGenerateSalary} className="space-y-4 py-2 text-xs">
                        <div>
                            <Label className="text-xs">Select Employee *</Label>
                            <select
                                required
                                value={selectedEmployeeId}
                                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground font-semibold focus:ring-1 focus:ring-primary"
                            >
                                <option value="">-- Choose Employee --</option>
                                {activeEmployees.map((emp) => (
                                    <option key={emp.id} value={emp.id}>
                                        {emp.name} ({emp.employee_code}) · ₹{Number(emp.present_salary || 0).toLocaleString("en-IN")}/mo
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg border">
                            <div>
                                <Label className="text-xs">Overtime Pay (₹)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={overtimeAmount}
                                    onChange={(e) => setOvertimeAmount(e.target.value)}
                                    className="h-8 text-xs bg-background mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Allowances (₹)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={allowancesAmount}
                                    onChange={(e) => setAllowancesAmount(e.target.value)}
                                    className="h-8 text-xs bg-background mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Bonus (₹)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={bonusAmount}
                                    onChange={(e) => setBonusAmount(e.target.value)}
                                    className="h-8 text-xs bg-background mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Advance Deduction (₹)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={advanceDeduction}
                                    onChange={(e) => setAdvanceDeduction(e.target.value)}
                                    className="h-8 text-xs bg-background mt-1"
                                />
                            </div>
                            <div className="col-span-2">
                                <Label className="text-xs">Other Deductions (₹)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={otherDeductions}
                                    onChange={(e) => setOtherDeductions(e.target.value)}
                                    className="h-8 text-xs bg-background mt-1"
                                />
                            </div>
                        </div>

                        <div>
                            <Label className="text-xs">Remarks / Calculation Notes</Label>
                            <Input
                                placeholder="e.g. Regular monthly payroll"
                                value={salaryRemarks}
                                onChange={(e) => setSalaryRemarks(e.target.value)}
                                className="h-8 text-xs bg-background mt-1"
                            />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setGenerateModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={generating}
                                className="bg-[#183260] hover:bg-[#122548] text-white font-semibold"
                            >
                                {generating ? "Generating..." : "Generate & Save Payroll"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MARK AS PAID MODAL */}
            <Dialog open={markPaidModalOpen} onOpenChange={setMarkPaidModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                            <CreditCard className="h-5 w-5" /> Mark Salary as Paid
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Employee: <b>{payingSalary?.employee_name}</b> · Amount: <b>₹{Number(payingSalary?.net_salary || 0).toLocaleString("en-IN")}</b>
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleConfirmMarkPaid} className="space-y-3 py-2 text-xs">
                        <div>
                            <Label className="text-xs">Payment Date *</Label>
                            <Input
                                type="date"
                                required
                                value={paymentDate}
                                onChange={(e) => setPaymentDate(e.target.value)}
                                className="h-8 text-xs bg-background mt-1"
                            />
                        </div>

                        <div>
                            <Label className="text-xs">Payment Mode *</Label>
                            <select
                                required
                                value={paymentMode}
                                onChange={(e) => setPaymentMode(e.target.value)}
                                className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground mt-1"
                            >
                                <option value="Bank Transfer">Bank Transfer (NEFT / RTGS / IMPS)</option>
                                <option value="UPI">UPI</option>
                                <option value="Cheque">Cheque</option>
                                <option value="Cash">Cash</option>
                            </select>
                        </div>

                        <div>
                            <Label className="text-xs">Transaction Reference / UTR Number</Label>
                            <Input
                                placeholder="e.g. UTR123456789 or Cheque # 00123"
                                value={transactionRef}
                                onChange={(e) => setTransactionRef(e.target.value)}
                                className="h-8 text-xs bg-background mt-1 font-mono"
                            />
                        </div>

                        <div>
                            <Label className="text-xs">Upload Payment Proof / Bank Receipt (Optional)</Label>
                            <Input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={(e) => setProofFile(e.target.files[0] || null)}
                                className="h-8 text-xs bg-background mt-1 file:text-xs file:py-0"
                            />
                        </div>

                        <div>
                            <Label className="text-xs">Payment Remarks</Label>
                            <Input
                                placeholder="e.g. Paid via corporate account"
                                value={paymentRemarks}
                                onChange={(e) => setPaymentRemarks(e.target.value)}
                                className="h-8 text-xs bg-background mt-1"
                            />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setMarkPaidModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={payingAction}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                            >
                                {payingAction ? "Processing..." : "Confirm Payment"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* SALARY SLIP MODAL (PRINTABLE / PDF-READY) */}
            {slipData && (
                <Dialog open={slipModalOpen} onOpenChange={setSlipModalOpen}>
                    <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <div className="flex items-center justify-between">
                                <DialogTitle className="text-base font-bold text-foreground">
                                    Salary Slip - {slipData.salary_month}
                                </DialogTitle>
                                <Button size="sm" onClick={handlePrintSlip} className="bg-[#183260] hover:bg-[#122548] text-white text-xs">
                                    <Printer className="mr-1.5 h-3.5 w-3.5" />
                                    Print / Save PDF
                                </Button>
                            </div>
                        </DialogHeader>

                        {/* Printable Area */}
                        <div ref={printRef} className="p-4 border rounded-xl bg-card space-y-4 text-xs text-foreground">
                            {/* Company Header */}
                            <div className="header flex items-center justify-between border-b-2 border-[#183260] pb-3">
                                <div className="flex items-center gap-3">
                                    <img src={jbEngineeringLogo} alt="Logo" className="h-10 object-contain" />
                                    <div>
                                        <h2 className="text-lg font-black tracking-tight text-[#183260] dark:text-cyan-400">JB ENGINEERING</h2>
                                        <p className="text-[10px] text-muted-foreground font-medium">RE-BAR COUPLERS INDIA PVT LTD</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-sm text-foreground">PAYSLIP</p>
                                    <p className="text-xs text-[#183260] dark:text-cyan-400 font-semibold">{slipData.salary_month}</p>
                                </div>
                            </div>

                            {/* Employee Information */}
                            <div className="grid grid-cols-2 gap-2 bg-muted/30 p-3 rounded-lg border text-[11px]">
                                <div>
                                    <span className="text-muted-foreground font-semibold">Employee Name: </span>
                                    <span className="font-bold text-foreground">{slipData.employee_name}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground font-semibold">Employee Code: </span>
                                    <span className="font-mono font-bold text-[#183260] dark:text-cyan-400">{slipData.employee_code}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground font-semibold">Designation: </span>
                                    <span className="font-medium text-foreground">{slipData.designation || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground font-semibold">Location: </span>
                                    <span className="font-medium text-foreground">{slipData.location || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground font-semibold">Bank Name: </span>
                                    <span className="font-medium text-foreground">{slipData.bank_name || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground font-semibold">Bank A/C: </span>
                                    <span className="font-mono font-medium text-foreground">{slipData.bank_account_number || "—"}</span>
                                </div>
                            </div>

                            {/* Attendance Breakdown */}
                            <div className="bg-muted/30 p-2.5 rounded border text-[11px] flex justify-between items-center">
                                <div><b>Working Days:</b> {slipData.attendance?.total_working_days}</div>
                                <div><b>Present Days:</b> <span className="text-emerald-700 font-bold">{slipData.attendance?.present_days}</span></div>
                                <div><b>Paid Leaves:</b> {slipData.attendance?.paid_leave_days}</div>
                                <div><b>Absent:</b> <span className="text-destructive font-semibold">{slipData.attendance?.absent_days}</span></div>
                                <div><b>Half Days:</b> {slipData.attendance?.half_days}</div>
                            </div>

                            {/* Earnings vs Deductions Table */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="border rounded-lg overflow-hidden">
                                    <div className="bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 font-bold text-emerald-900 dark:text-emerald-200 border-b">
                                        Earnings
                                    </div>
                                    <table className="w-full text-[11px]">
                                        <tbody>
                                            <tr className="border-b">
                                                <td className="p-2 text-muted-foreground">Basic Earned</td>
                                                <td className="p-2 text-right font-medium">₹{Number(slipData.earnings?.basic_salary || 0).toLocaleString("en-IN")}</td>
                                            </tr>
                                            <tr className="border-b">
                                                <td className="p-2 text-muted-foreground">Overtime</td>
                                                <td className="p-2 text-right font-medium">₹{Number(slipData.earnings?.overtime || 0).toLocaleString("en-IN")}</td>
                                            </tr>
                                            <tr className="border-b">
                                                <td className="p-2 text-muted-foreground">Allowances</td>
                                                <td className="p-2 text-right font-medium">₹{Number(slipData.earnings?.allowances || 0).toLocaleString("en-IN")}</td>
                                            </tr>
                                            <tr className="border-b">
                                                <td className="p-2 text-muted-foreground">Bonus</td>
                                                <td className="p-2 text-right font-medium">₹{Number(slipData.earnings?.bonus || 0).toLocaleString("en-IN")}</td>
                                            </tr>
                                            <tr className="bg-emerald-50/50 dark:bg-emerald-950/20 font-bold">
                                                <td className="p-2 text-emerald-900 dark:text-emerald-200">Gross Earnings</td>
                                                <td className="p-2 text-right text-emerald-900 dark:text-emerald-200">₹{Number(slipData.earnings?.gross_salary || 0).toLocaleString("en-IN")}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                <div className="border rounded-lg overflow-hidden">
                                    <div className="bg-red-50 dark:bg-red-950/40 px-3 py-1.5 font-bold text-red-900 dark:text-red-200 border-b">
                                        Deductions
                                    </div>
                                    <table className="w-full text-[11px]">
                                        <tbody>
                                            <tr className="border-b">
                                                <td className="p-2 text-muted-foreground">Absent & Half-Day</td>
                                                <td className="p-2 text-right font-medium text-destructive">₹{Number(slipData.deductions?.salary_deduction || 0).toLocaleString("en-IN")}</td>
                                            </tr>
                                            <tr className="border-b">
                                                <td className="p-2 text-muted-foreground">Advance Salary</td>
                                                <td className="p-2 text-right font-medium text-destructive">₹{Number(slipData.deductions?.advance_deduction || 0).toLocaleString("en-IN")}</td>
                                            </tr>
                                            <tr className="border-b">
                                                <td className="p-2 text-muted-foreground">Other Deductions</td>
                                                <td className="p-2 text-right font-medium text-destructive">₹{Number(slipData.deductions?.other_deductions || 0).toLocaleString("en-IN")}</td>
                                            </tr>
                                            <tr className="bg-red-50/50 dark:bg-red-950/20 font-bold">
                                                <td className="p-2 text-red-900 dark:text-red-200">Total Deductions</td>
                                                <td className="p-2 text-right text-red-900 dark:text-red-200">₹{Number(slipData.deductions?.total_deductions || 0).toLocaleString("en-IN")}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Net Salary Highlight */}
                            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900 text-white">
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-slate-300">Net Payable Salary</p>
                                    <p className="text-xl font-black text-emerald-400">
                                        ₹{Number(slipData.net_salary || 0).toLocaleString("en-IN")}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span
                                        className={cn(
                                            "inline-block rounded-full px-3 py-1 text-xs font-bold uppercase",
                                            slipData.payment_status === "Paid"
                                                ? "bg-emerald-500 text-white"
                                                : "bg-amber-500 text-white"
                                        )}
                                    >
                                        Status: {slipData.payment_status}
                                    </span>
                                    {slipData.payment_date && (
                                        <p className="text-[10px] text-slate-400 mt-1">Paid on: {slipData.payment_date}</p>
                                    )}
                                </div>
                            </div>

                            {/* Footer Signatures */}
                            <div className="pt-8 flex justify-between text-[11px] text-muted-foreground border-t">
                                <div>
                                    <p className="border-t border-border pt-1 w-32 text-center">Prepared By (HR)</p>
                                </div>
                                <div>
                                    <p className="border-t border-border pt-1 w-32 text-center">Authorized Signatory</p>
                                </div>
                                <div>
                                    <p className="border-t border-border pt-1 w-32 text-center">Employee Signature</p>
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setSlipModalOpen(false)}>
                                Close
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
