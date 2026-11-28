import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ColumnFilterDropdown from "@/components/ui/ColumnFilterDropdown";
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    Search,
    Lock,
    Unlock,
    Download,
    CheckCircle2,
    AlertCircle,
    Info,
    CalendarCheck,
    Check,
    X,
    Filter,
    RotateCcw,
    Clock,
} from "lucide-react";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import SalaryCalculationModal from "@/components/hr/SalaryCalculationModal";
import {
    fetchHRAttendance,
    markHRAttendance,
    markHROT,
    clearHROT,
    bulkMarkHRAttendance,
    fetchHRAttendanceCloseStatus,
    closeHRAttendance,
    reopenHRAttendance,
    fetchHRDesignations,
    fetchHRLocations,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useAuth } from "@/context/AuthContext";

const STATUS_CONFIG = {
    P: { label: "Present", code: "P", bg: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300", badgeBg: "bg-emerald-600 text-white", sub: "Full Day" },
    TR: { label: "Travel", code: "TR", bg: "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-300", badgeBg: "bg-teal-600 text-white", sub: "100% Paid" },
    A: { label: "Absent", code: "A", bg: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300", badgeBg: "bg-red-600 text-white", sub: "Salary Deducted" },
    H: { label: "Half Day", code: "H", bg: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300", badgeBg: "bg-amber-600 text-white", sub: "0.5 Day Deducted" },
    HD: { label: "Half Day", code: "HD", bg: "bg-lime-100 text-lime-900 border-lime-400 dark:bg-lime-950 dark:text-lime-200", badgeBg: "bg-lime-600 text-white", sub: "No Deduction" },
    PL: { label: "Paid Leave", code: "PL", bg: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300", badgeBg: "bg-blue-600 text-white", sub: "No Deduction" },
    UL: { label: "Unpaid Leave", code: "UL", bg: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300", badgeBg: "bg-rose-600 text-white", sub: "Salary Deducted (LWP)" },
    WO: { label: "Weekly Off", code: "WO", bg: "bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300", badgeBg: "bg-slate-600 text-white", sub: "100% Paid" },
    HOL: { label: "Holiday", code: "HOL", bg: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300", badgeBg: "bg-purple-600 text-white", sub: "100% Paid" },
};

const getStatusConfig = (code) => {
    if (!code) return null;
    if (code === "L") return STATUS_CONFIG.PL;
    if (code === "HP") return STATUS_CONFIG.HD;
    return STATUS_CONFIG[code] || null;
};

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const isFutureDate = (year, month, day) => {
    const target = new Date(year, month - 1, day);
    target.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return target > now;
};

const DEFAULT_ATTENDANCE_WIDTHS = {
    name: 180,
    code: 90,
    designation: 140,
    location: 110,
    day: 32,
    p: 38,
    tr: 38,
    a: 38,
    h: 38,
    hd: 38,
    pl: 38,
    ul: 38,
    wo: 40,
    hol: 40,
    ot: 55,
    present_days: 105,
    salary_calc: 130,
};

function ResizableHeader({
    label,
    width,
    onResizeStart,
    align = "left",
    className = "",
    style = {},
    children,
    title,
}) {
    return (
        <th
            style={{ width, minWidth: width, maxWidth: width, ...style }}
            className={cn(
                "relative select-none p-2 text-[10px] font-bold uppercase tracking-wider",
                align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left",
                className
            )}
            title={title || label}
        >
            {children || <span className="truncate block">{label}</span>}
            {onResizeStart && (
                <div
                    onMouseDown={onResizeStart}
                    className="group/resize absolute right-0 top-0 h-full w-2.5 cursor-col-resize z-30 flex items-center justify-center hover:bg-blue-500/20"
                    title="Drag to resize column width"
                >
                    <div className="w-[2px] h-full bg-blue-500 shadow-[0_0_4px_#3b82f6] group-hover/resize:w-[3px] group-hover/resize:bg-blue-400 transition-all" />
                </div>
            )}
        </th>
    );
}

export default function HRAttendance() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const isSuperAdmin = Boolean(user?.is_super_admin);

    const today = new Date();
    const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(today.getFullYear());
    const [selectedDesignation, setSelectedDesignation] = useState("all");
    const [selectedLocation, setSelectedLocation] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");

    const [selectedCell, setSelectedCell] = useState(null);

    const [closeModalOpen, setCloseModalOpen] = useState(false);
    const [closeNotes, setCloseNotes] = useState("");
    const [closingAction, setClosingAction] = useState(false);

    const [reopenModalOpen, setReopenModalOpen] = useState(false);
    const [reopenNotes, setReopenNotes] = useState("");

    // Salary Calculation Modal state
    const [salaryModalOpen, setSalaryModalOpen] = useState(false);
    const [selectedSalaryEmployee, setSelectedSalaryEmployee] = useState(null);

    // Overtime (OT) Modal state
    const [otModalOpen, setOtModalOpen] = useState(false);
    const [otData, setOtData] = useState({
        employee: null,
        day: null,
        hours: "",
        remarks: "",
    });
    const [savingOT, setSavingOT] = useState(false);

    const { data: attendanceData, isLoading } = useQuery({
        queryKey: ["hr-attendance", selectedMonth, selectedYear, selectedDesignation, selectedLocation, searchTerm],
        queryFn: () =>
            fetchHRAttendance({
                month: selectedMonth,
                year: selectedYear,
                designation: selectedDesignation === "all" ? undefined : selectedDesignation,
                location: selectedLocation === "all" ? undefined : selectedLocation,
                search: searchTerm || undefined,
            }),
    });

    const { data: rawDesignations = [] } = useQuery({
        queryKey: ["hr-meta-designations"],
        queryFn: fetchHRDesignations,
    });
    const designations = useMemo(() => (Array.isArray(rawDesignations) ? rawDesignations : []), [rawDesignations]);

    const { data: rawLocations = [] } = useQuery({
        queryKey: ["hr-meta-locations"],
        queryFn: fetchHRLocations,
    });
    const locations = useMemo(() => (Array.isArray(rawLocations) ? rawLocations : []), [rawLocations]);

    const daysInMonth = attendanceData?.days_in_month || new Date(selectedYear, selectedMonth, 0).getDate();
    const isClosed = Boolean(attendanceData?.is_closed);
    const employees = useMemo(() => (Array.isArray(attendanceData?.employees) ? attendanceData.employees : []), [attendanceData]);

    // Column sort & filter state
    const [sortKey, setSortKey] = useState(null);
    const [sortDir, setSortDir] = useState("asc");
    const [colFilters, setColFilters] = useState({});

    const handleColSort = useCallback((key, dir) => {
        setSortKey(key);
        setSortDir(dir);
    }, []);

    const getAttendanceColDisplayValue = useCallback((emp, key) => {
        const s = emp.summary || {};
        switch (key) {
            case "name": return emp.name || "";
            case "code": return emp.employee_code || "";
            case "designation": return emp.designation || "";
            case "location": return emp.location || "";
            case "present_days": {
                const pt = (s.P || 0) + (s.TR || 0) + (s.PL || 0) + (s.L || 0) + (s.HD || 0) + (s.HP || 0) + (s.H || 0) * 0.5;
                return String(pt);
            }
            default: return "";
        }
    }, []);

    const columnUniqueValues = useMemo(() => {
        const keys = ["name", "code", "designation", "location", "present_days"];
        const map = {};
        keys.forEach((k) => {
            const set = new Set();
            employees.forEach((emp) => {
                const val = getAttendanceColDisplayValue(emp, k);
                if (val !== undefined && val !== null && String(val).trim() !== "") {
                    set.add(String(val).trim());
                }
            });
            map[k] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        });
        return map;
    }, [employees, getAttendanceColDisplayValue]);

    const processedEmployees = useMemo(() => {
        let list = [...employees];

        // Apply column filters
        Object.entries(colFilters).forEach(([colKey, allowedValues]) => {
            if (allowedValues && Array.isArray(allowedValues)) {
                const allowedSet = new Set(allowedValues.map((v) => String(v).trim()));
                list = list.filter((emp) => allowedSet.has(String(getAttendanceColDisplayValue(emp, colKey)).trim()));
            }
        });

        // Apply column sorting
        if (sortKey) {
            list.sort((a, b) => {
                if (sortKey === "present_days") {
                    const ptA = (a.summary?.P || 0) + (a.summary?.TR || 0) + (a.summary?.PL || 0) + (a.summary?.L || 0) + (a.summary?.HD || 0) + (a.summary?.HP || 0) + (a.summary?.H || 0) * 0.5;
                    const ptB = (b.summary?.P || 0) + (b.summary?.TR || 0) + (b.summary?.PL || 0) + (b.summary?.L || 0) + (b.summary?.HD || 0) + (b.summary?.HP || 0) + (b.summary?.H || 0) * 0.5;
                    return sortDir === "asc" ? ptA - ptB : ptB - ptA;
                } else {
                    const valA = String(getAttendanceColDisplayValue(a, sortKey) || "").toLowerCase();
                    const valB = String(getAttendanceColDisplayValue(b, sortKey) || "").toLowerCase();
                    const cmp = valA.localeCompare(valB, undefined, { numeric: true });
                    return sortDir === "asc" ? cmp : -cmp;
                }
            });
        }

        return list;
    }, [employees, colFilters, sortKey, sortDir, getAttendanceColDisplayValue]);

    const { widths, startResize, resetWidths } = useResizableColumns(
        "colw:hr-attendance-v1",
        DEFAULT_ATTENDANCE_WIDTHS
    );

    const totalTableWidth = useMemo(() => {
        return (
            (widths.name || 180) +
            (widths.code || 90) +
            (widths.designation || 140) +
            (widths.location || 110) +
            daysInMonth * (widths.day || 32) +
            (widths.p || 38) +
            (widths.tr || 38) +
            (widths.a || 38) +
            (widths.h || 38) +
            (widths.hd || 38) +
            (widths.pl || 38) +
            (widths.ul || 38) +
            (widths.wo || 40) +
            (widths.hol || 40) +
            (widths.ot || 55) +
            (widths.present_days || 105) +
            (widths.salary_calc || 130)
        );
    }, [widths, daysInMonth]);

    const handleViewSalary = (emp) => {
        setSelectedSalaryEmployee(emp);
        setSalaryModalOpen(true);
    };

    const handleCellClick = (employee, day) => {
        if (!employee.is_active) {
            toast.error(`Employee ${employee.name} is Inactive. Attendance fill nahi ho sakti.`);
            return;
        }
        if (isFutureDate(selectedYear, selectedMonth, day)) {
            toast.error(`Future date (Day ${day}) ki attendance mark nahi ki ja sakti. Sirf aaj tak allow hai.`);
            return;
        }
        if (isClosed) {
            toast.info("Attendance is locked. Please reopen attendance to edit.");
            setReopenModalOpen(true);
            return;
        }
        const current = employee.attendance?.[day] || "";
        const currentOT = employee.ot?.[day] || null;
        setSelectedCell({
            employee,
            day,
            currentStatus: current,
            currentOT,
        });
    };

    const handleOpenOTModal = () => {
        if (!selectedCell) return;
        const { employee, day, currentOT } = selectedCell;
        setOtData({
            employee,
            day,
            hours: currentOT?.ot_hours ?? "",
            remarks: currentOT?.ot_remarks ?? "",
        });
        setSelectedCell(null);
        setOtModalOpen(true);
    };

    const handleSaveOT = async () => {
        if (!otData.employee || !otData.day) return;
        const numHours = parseFloat(otData.hours);
        if (isNaN(numHours) || numHours <= 0) {
            toast.error("Please enter valid overtime hours (> 0).");
            return;
        }
        const monthStr = String(selectedMonth).padStart(2, "0");
        const dayStr = String(otData.day).padStart(2, "0");
        const dateStr = `${selectedYear}-${monthStr}-${dayStr}`;

        setSavingOT(true);
        try {
            await markHROT({
                employee_id: otData.employee.employee_id,
                attendance_date: dateStr,
                ot_hours: numHours,
                ot_remarks: otData.remarks || undefined,
            });
            toast.success(`Saved ${numHours} hrs overtime for ${otData.employee.name} on Day ${otData.day}`);
            setOtModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["hr-attendance"] });
            queryClient.invalidateQueries({ queryKey: ["hr-salary-preview"] });
            queryClient.invalidateQueries({ queryKey: ["hr-salaries"] });
            queryClient.invalidateQueries({ queryKey: ["hr-dashboard"] });
        } catch (err) {
            toast.error(err.message || "Failed to save overtime");
        } finally {
            setSavingOT(false);
        }
    };

    const handleClearOT = async () => {
        if (!otData.employee || !otData.day) return;
        const monthStr = String(selectedMonth).padStart(2, "0");
        const dayStr = String(otData.day).padStart(2, "0");
        const dateStr = `${selectedYear}-${monthStr}-${dayStr}`;

        setSavingOT(true);
        try {
            await clearHROT({
                employee_id: otData.employee.employee_id,
                attendance_date: dateStr,
            });
            toast.success(`Cleared overtime for ${otData.employee.name} on Day ${otData.day}`);
            setOtModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["hr-attendance"] });
            queryClient.invalidateQueries({ queryKey: ["hr-salary-preview"] });
            queryClient.invalidateQueries({ queryKey: ["hr-salaries"] });
            queryClient.invalidateQueries({ queryKey: ["hr-dashboard"] });
        } catch (err) {
            toast.error(err.message || "Failed to clear overtime");
        } finally {
            setSavingOT(false);
        }
    };

    const handleSetStatus = async (status) => {
        if (!selectedCell) return;
        const { employee, day } = selectedCell;
        const monthStr = String(selectedMonth).padStart(2, "0");
        const dayStr = String(day).padStart(2, "0");
        const dateStr = `${selectedYear}-${monthStr}-${dayStr}`;

        try {
            await markHRAttendance({
                employee_id: employee.employee_id,
                attendance_date: dateStr,
                status,
            });
            if (status === "CLEAR") {
                toast.success(`Cleared attendance for ${employee.name} on day ${day}`);
            } else {
                toast.success(`Marked ${STATUS_CONFIG[status]?.label} for ${employee.name} on day ${day}`);
            }
            setSelectedCell(null);
            queryClient.invalidateQueries({ queryKey: ["hr-attendance"] });
            queryClient.invalidateQueries({ queryKey: ["hr-dashboard"] });
        } catch (err) {
            toast.error(err.message || "Failed to mark attendance");
        }
    };

    const handleMarkSundayWO = async () => {
        if (isClosed) {
            toast.error("Attendance is locked. Please reopen attendance first.");
            setReopenModalOpen(true);
            return;
        }
        const sundays = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const dt = new Date(selectedYear, selectedMonth - 1, d);
            if (dt.getDay() === 0) {
                if (!isFutureDate(selectedYear, selectedMonth, d)) {
                    sundays.push(d);
                }
            }
        }

        if (!sundays.length) {
            toast.info("Is month mein aaj tak koi Sunday nahi hai jise mark kiya ja sake.");
            return;
        }

        if (!employees.length) {
            toast.error("No employees to mark");
            return;
        }

        if (!window.confirm(`Auto-mark past/today Sundays (${sundays.join(", ")}) as Weekly Off (WO) for all active employees?`)) return;

        const records = [];
        const monthStr = String(selectedMonth).padStart(2, "0");
        employees.forEach((emp) => {
            if (!emp.is_active) return;
            sundays.forEach((day) => {
                const dayStr = String(day).padStart(2, "0");
                records.push({
                    employee_id: emp.employee_id,
                    attendance_date: `${selectedYear}-${monthStr}-${dayStr}`,
                    status: "WO",
                });
            });
        });

        try {
            await bulkMarkHRAttendance({ records });
            toast.success(`Marked Sundays as Weekly Off for all employees!`);
            queryClient.invalidateQueries({ queryKey: ["hr-attendance"] });
        } catch (err) {
            toast.error(err.message || "Failed to mark Sundays");
        }
    };

    const handleConfirmClose = async () => {
        setClosingAction(true);
        try {
            await closeHRAttendance({
                month: selectedMonth,
                year: selectedYear,
                notes: closeNotes,
            });
            toast.success(`Attendance for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} is now VERIFIED & LOCKED!`);
            setCloseModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["hr-attendance"] });
            queryClient.invalidateQueries({ queryKey: ["hr-dashboard"] });
        } catch (err) {
            toast.error(err.message || "Failed to close attendance");
        } finally {
            setClosingAction(false);
        }
    };

    const handleConfirmReopen = async () => {
        setClosingAction(true);
        try {
            await reopenHRAttendance({
                month: selectedMonth,
                year: selectedYear,
                notes: reopenNotes || "Attendance reopened for editing",
            });
            toast.success(`Attendance for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} is now unlocked! You can now edit attendance.`);
            setReopenModalOpen(false);
            setReopenNotes("");
            queryClient.invalidateQueries({ queryKey: ["hr-attendance"] });
            queryClient.invalidateQueries({ queryKey: ["hr-dashboard"] });
        } catch (err) {
            toast.error(err.message || "Failed to reopen attendance");
        } finally {
            setClosingAction(false);
        }
    };

    const handleExportCSV = () => {
        if (!employees.length) {
            toast.error("No attendance data to export");
            return;
        }

        const headers = [
            "S.No",
            "Emp Code",
            "Employee Name",
            "Designation",
            "Location",
            ...Array.from({ length: daysInMonth }, (_, i) => `Day ${i + 1}`),
            "Present (P)",
            "Travel (TR)",
            "Absent (A)",
            "Half Day (H)",
            "Half Day - No Ded (HD)",
            "Paid Leave (PL)",
            "Unpaid Leave (UL)",
            "Weekly Off (WO)",
            "Holiday (HOL)",
            "Approved OT (Hrs)",
            "Total Present Days",
        ];

        const rows = employees.map((emp, idx) => {
            const daysValues = Array.from({ length: daysInMonth }, (_, i) => emp.attendance?.[i + 1] || "-");
            const s = emp.summary || {};
            const presentTotal = (s.P || 0) + (s.TR || 0) + (s.PL || 0) + (s.L || 0) + (s.HD || 0) + (s.HP || 0) + (s.H || 0) * 0.5;
            return [
                idx + 1,
                `"${emp.employee_code}"`,
                `"${emp.name}"`,
                `"${emp.designation || ""}"`,
                `"${emp.location || ""}"`,
                ...daysValues,
                s.P || 0,
                s.TR || 0,
                s.A || 0,
                s.H || 0,
                (s.HD || 0) + (s.HP || 0),
                (s.PL || 0) + (s.L || 0),
                s.UL || 0,
                s.WO || 0,
                s.HOL || 0,
                emp.total_ot_hours || 0,
                presentTotal,
            ];
        });

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Attendance_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const missingEntriesSummary = useMemo(() => {
        if (!employees.length) return { missingCount: 0, totalSlots: 0 };
        let missing = 0;
        let total = 0;
        employees.forEach((emp) => {
            if (!emp.is_active) return;
            for (let d = 1; d <= daysInMonth; d++) {
                total++;
                if (!emp.attendance?.[d]) {
                    missing++;
                }
            }
        });
        return { missingCount: missing, totalSlots: total };
    }, [employees, daysInMonth]);

    const monthTotalOTHours = useMemo(() => {
        return employees.reduce((acc, emp) => acc + (Number(emp.total_ot_hours) || 0), 0);
    }, [employees]);

    return (
        <div className="space-y-4">
            {/* Header: Title, Month/Year Picker, Close Attendance Button */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3.5">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Attendance Management</h1>
                        {isClosed ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2.5 py-0.5 text-xs font-bold">
                                <Lock className="h-3 w-3" /> Verified & Locked
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2.5 py-0.5 text-xs font-bold">
                                <AlertCircle className="h-3 w-3" /> Open for Marking
                            </span>
                        )}
                        {monthTotalOTHours > 0 && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950 dark:text-amber-200 px-2.5 py-0.5 text-xs font-bold" title="Month-wise Total Approved Overtime Hours across employees">
                                <Clock className="h-3 w-3 text-amber-600" /> Total OT: {monthTotalOTHours} hrs
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Monthly register for {MONTH_NAMES[selectedMonth - 1]} {selectedYear} ({daysInMonth} Days)
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {!isClosed && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleMarkSundayWO}
                            className="text-xs"
                            title="Auto mark all Sundays as Weekly Off"
                        >
                            Mark Sunday WO
                        </Button>
                    )}

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportCSV}
                        className="text-xs"
                    >
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        Export Excel
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={resetWidths}
                        className="text-xs"
                        title="Reset columns to default width"
                    >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Reset Columns
                    </Button>

                    {!isClosed ? (
                        <Button
                            size="sm"
                            onClick={() => setCloseModalOpen(true)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
                        >
                            <Lock className="mr-1.5 h-3.5 w-3.5" />
                            Verify & Close Attendance
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReopenModalOpen(true)}
                            className="border-amber-400 text-amber-800 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-300 font-semibold"
                            title="Unlock attendance for this month to make corrections"
                        >
                            <Unlock className="mr-1.5 h-3.5 w-3.5" />
                            Reopen Attendance to Edit
                        </Button>
                    )}
                </div>
            </div>

            {/* Filter Controls: Month, Year, Designation, Location, Search */}
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5 bg-card p-3 rounded-xl border border-border shadow-xs text-xs">
                <div>
                    <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Month</label>
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
                    <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Year</label>
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
                    <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Designation</label>
                    <select
                        value={selectedDesignation}
                        onChange={(e) => setSelectedDesignation(e.target.value)}
                        className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:ring-1 focus:ring-primary"
                    >
                        <option value="all">All Designations</option>
                        {designations.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Location</label>
                    <select
                        value={selectedLocation}
                        onChange={(e) => setSelectedLocation(e.target.value)}
                        className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:ring-1 focus:ring-primary"
                    >
                        <option value="all">All Locations</option>
                        {locations.map((loc) => (
                            <option key={loc} value={loc}>
                                {loc}
                            </option>
                        ))}
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

            {/* Legend / Status Key */}
            <div className="flex flex-wrap items-center gap-3 bg-muted/40 p-2.5 rounded-lg border border-border text-xs">
                <span className="font-semibold text-foreground text-[11px]">Legend:</span>
                {Object.entries(STATUS_CONFIG).map(([code, config]) => (
                    <div key={code} className="flex items-center gap-1.5">
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold border", config.bg)}>
                            {code}
                        </span>
                        <span className="text-muted-foreground text-[11px]">{config.label}</span>
                    </div>
                ))}
                <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200">
                        OT
                    </span>
                    <span className="text-muted-foreground text-[11px]">Overtime</span>
                </div>
                <span className="ml-auto text-[11px] text-muted-foreground">
                    💡 Click any date box to mark / update status
                </span>
            </div>

            {/* Attendance Register Grid - Full width */}
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                <div className="overflow-x-auto min-h-[440px]">
                    <table style={{ width: totalTableWidth, minWidth: "100%" }} className="w-full border-collapse text-left text-xs table-fixed">
                        <thead>
                            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-[10px] font-bold uppercase tracking-wider border-b border-slate-300 dark:border-slate-700 select-none">
                                <ResizableHeader
                                    label="Employee Name"
                                    width={widths.name}
                                    onResizeStart={startResize("name", 120, 400)}
                                    style={{ left: 0 }}
                                    className="sticky left-0 z-30 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-r border-slate-300 dark:border-slate-700 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)] pl-3"
                                >
                                    <ColumnFilterDropdown
                                        label="Employee Name"
                                        colKey="name"
                                        allValues={columnUniqueValues.name || []}
                                        activeFilters={colFilters}
                                        setActiveFilters={setColFilters}
                                        sortKey={sortKey}
                                        sortDir={sortDir}
                                        onSort={handleColSort}
                                        align="left"
                                    />
                                </ResizableHeader>

                                <ResizableHeader
                                    label="Code"
                                    width={widths.code}
                                    onResizeStart={startResize("code", 60, 200)}
                                    style={{ left: widths.name }}
                                    className="sticky z-30 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-r border-slate-300 dark:border-slate-700 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)]"
                                >
                                    <ColumnFilterDropdown
                                        label="Code"
                                        colKey="code"
                                        allValues={columnUniqueValues.code || []}
                                        activeFilters={colFilters}
                                        setActiveFilters={setColFilters}
                                        sortKey={sortKey}
                                        sortDir={sortDir}
                                        onSort={handleColSort}
                                        align="left"
                                    />
                                </ResizableHeader>

                                <ResizableHeader
                                    label="Designation"
                                    width={widths.designation}
                                    onResizeStart={startResize("designation", 80, 300)}
                                    className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700"
                                >
                                    <ColumnFilterDropdown
                                        label="Designation"
                                        colKey="designation"
                                        allValues={columnUniqueValues.designation || []}
                                        activeFilters={colFilters}
                                        setActiveFilters={setColFilters}
                                        sortKey={sortKey}
                                        sortDir={sortDir}
                                        onSort={handleColSort}
                                        align="left"
                                    />
                                </ResizableHeader>

                                <ResizableHeader
                                    label="Office Location"
                                    width={widths.location}
                                    onResizeStart={startResize("location", 70, 250)}
                                    className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700"
                                >
                                    <ColumnFilterDropdown
                                        label="Office Location"
                                        colKey="location"
                                        allValues={columnUniqueValues.location || []}
                                        activeFilters={colFilters}
                                        setActiveFilters={setColFilters}
                                        sortKey={sortKey}
                                        sortDir={sortDir}
                                        onSort={handleColSort}
                                        align="left"
                                    />
                                </ResizableHeader>

                                {Array.from({ length: daysInMonth }, (_, i) => {
                                    const dayNum = i + 1;
                                    const d = new Date(selectedYear, selectedMonth - 1, dayNum);
                                    const isSun = d.getDay() === 0;
                                    const isFuture = isFutureDate(selectedYear, selectedMonth, dayNum);
                                    const isToday = !isFuture && d.toDateString() === today.toDateString();

                                    return (
                                        <ResizableHeader
                                            key={dayNum}
                                            width={widths.day}
                                            onResizeStart={startResize("day", 24, 60)}
                                            align="center"
                                            className={cn(
                                                "p-0.5 transition-colors border-r border-slate-200 dark:border-slate-700",
                                                isToday && "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 font-black ring-1 ring-blue-500",
                                                isSun && !isToday && "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 font-extrabold",
                                                !isSun && !isToday && "text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800"
                                            )}
                                            title={isToday ? `Today (Day ${dayNum})` : isFuture ? `Future Date (Day ${dayNum}) - Attendance blocked` : `Day ${dayNum}`}
                                        >
                                            <div className="flex flex-col items-center">
                                                <span>{dayNum}</span>
                                                <span className="text-[8px] font-normal opacity-70">
                                                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d.getDay()]}
                                                </span>
                                                {isToday && (
                                                    <span className="mt-0.5 inline-block h-1 w-1 rounded-full bg-blue-600 dark:bg-blue-400" />
                                                )}
                                            </div>
                                        </ResizableHeader>
                                    );
                                })}

                                <ResizableHeader
                                    label="P"
                                    width={widths.p}
                                    onResizeStart={startResize("p", 28, 70)}
                                    align="center"
                                    className="bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-l border-r border-slate-200 dark:border-slate-700 font-black"
                                />
                                <ResizableHeader
                                    label="TR"
                                    width={widths.tr}
                                    onResizeStart={startResize("tr", 28, 70)}
                                    align="center"
                                    title="Travel (TR) — Official Work Travel / 100% Paid"
                                    className="bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300 border-r border-slate-200 dark:border-slate-700 font-black"
                                />
                                <ResizableHeader
                                    label="A"
                                    width={widths.a}
                                    onResizeStart={startResize("a", 28, 70)}
                                    align="center"
                                    className="bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300 border-r border-slate-200 dark:border-slate-700 font-black"
                                />
                                <ResizableHeader
                                    label="H"
                                    width={widths.h}
                                    onResizeStart={startResize("h", 28, 70)}
                                    align="center"
                                    title="Half Day (H) — 0.5 Day Deducted"
                                    className="bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-r border-slate-200 dark:border-slate-700 font-black"
                                />
                                <ResizableHeader
                                    label="HD"
                                    width={widths.hd}
                                    onResizeStart={startResize("hd", 28, 70)}
                                    align="center"
                                    title="Half Day (HD) — No Deduction (100% Paid)"
                                    className="bg-lime-50 text-lime-900 dark:bg-lime-950/50 dark:text-lime-200 border-r border-slate-200 dark:border-slate-700 font-black"
                                />
                                <ResizableHeader
                                    label="PL"
                                    width={widths.pl}
                                    onResizeStart={startResize("pl", 28, 70)}
                                    align="center"
                                    title="Paid Leave (PL) — No Deduction"
                                    className="bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-r border-slate-200 dark:border-slate-700 font-black"
                                />
                                <ResizableHeader
                                    label="UL"
                                    width={widths.ul}
                                    onResizeStart={startResize("ul", 28, 70)}
                                    align="center"
                                    title="Unpaid Leave (UL) — Salary Deducted (LWP)"
                                    className="bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border-r border-slate-200 dark:border-slate-700 font-black"
                                />
                                <ResizableHeader
                                    label="WO"
                                    width={widths.wo}
                                    onResizeStart={startResize("wo", 28, 80)}
                                    align="center"
                                    title="Weekly Off (WO) — 100% Paid"
                                    className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 font-black"
                                />
                                <ResizableHeader
                                    label="HOL"
                                    width={widths.hol}
                                    onResizeStart={startResize("hol", 28, 80)}
                                    align="center"
                                    title="Holiday (HOL) — 100% Paid"
                                    className="bg-purple-50 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 border-r border-slate-200 dark:border-slate-700 font-black"
                                />
                                <ResizableHeader
                                    label="OT (Hrs)"
                                    width={widths.ot}
                                    onResizeStart={startResize("ot", 35, 90)}
                                    align="center"
                                    className="bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300 border-r border-slate-200 dark:border-slate-700 font-black"
                                />
                                <ResizableHeader
                                    label="Present Days"
                                    width={widths.present_days}
                                    onResizeStart={startResize("present_days", 80, 160)}
                                    align="center"
                                    className="bg-slate-200/80 text-slate-900 dark:bg-slate-700 dark:text-white border-l border-r border-slate-300 font-bold"
                                >
                                    <ColumnFilterDropdown
                                        label="Present Days"
                                        colKey="present_days"
                                        allValues={columnUniqueValues.present_days || []}
                                        activeFilters={colFilters}
                                        setActiveFilters={setColFilters}
                                        sortKey={sortKey}
                                        sortDir={sortDir}
                                        onSort={handleColSort}
                                        align="center"
                                    />
                                </ResizableHeader>
                                <ResizableHeader
                                    label="Salary Calculation"
                                    width={widths.salary_calc}
                                    onResizeStart={startResize("salary_calc", 110, 220)}
                                    align="center"
                                    className="bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 border-l border-slate-300 font-bold"
                                />
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-border/60">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={daysInMonth + 13} className="p-8 text-center text-muted-foreground">
                                        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                        <p className="mt-2 text-xs">Loading attendance register...</p>
                                    </td>
                                </tr>
                            ) : processedEmployees.length === 0 ? (
                                <tr>
                                    <td colSpan={daysInMonth + 14} className="p-8 text-center text-muted-foreground">
                                        <CalendarCheck className="mx-auto h-8 w-8 text-muted-foreground/40" />
                                        <p className="mt-2 text-sm font-semibold text-foreground">No active employees found</p>
                                        <p className="text-xs text-muted-foreground">
                                            {Object.values(colFilters).some(Boolean) ? "Try clearing column filters." : "Register employees in Employee Details first."}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                processedEmployees.map((emp) => {
                                    const s = emp.summary || {};
                                    const presentTotal = (s.P || 0) + (s.TR || 0) + (s.PL || 0) + (s.L || 0) + (s.HD || 0) + (s.HP || 0) + (s.H || 0) * 0.5;
                                    const isInactive = !emp.is_active;

                                    return (
                                        <tr
                                            key={emp.employee_id}
                                            className={cn(
                                                "transition",
                                                isInactive
                                                    ? "bg-red-50/90 text-red-950 dark:bg-red-950/60 dark:text-red-100 border-b border-red-200 dark:border-red-900"
                                                    : "hover:bg-muted/30"
                                            )}
                                        >
                                            <td
                                                style={{
                                                    left: 0,
                                                    width: widths.name,
                                                    minWidth: widths.name,
                                                    maxWidth: widths.name,
                                                }}
                                                className={cn(
                                                    "sticky left-0 z-20 p-2 pl-3 font-semibold border-r border-border shadow-[2px_0_4px_-1px_rgba(0,0,0,0.1)] truncate",
                                                    isInactive
                                                        ? "bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-100 border-r-red-300"
                                                        : "bg-card dark:bg-slate-950 text-foreground"
                                                )}
                                            >
                                                <span className={cn(isInactive && "line-through opacity-85")}>{emp.name}</span>
                                                {isInactive && (
                                                    <span
                                                        className="ml-1.5 inline-block text-[9px] font-black text-red-700 bg-red-200/90 dark:bg-red-900 dark:text-red-100 px-1.5 py-0.5 rounded uppercase tracking-wider border border-red-300"
                                                        title={emp.inactive_date ? `Inactive since ${new Date(emp.inactive_date).toLocaleDateString("en-IN")}` : "Employee is Inactive"}
                                                    >
                                                        Inactive {emp.inactive_date ? `(${new Date(emp.inactive_date).toLocaleDateString("en-IN")})` : ""}
                                                    </span>
                                                )}
                                            </td>

                                            <td
                                                style={{
                                                    left: widths.name,
                                                    width: widths.code,
                                                    minWidth: widths.code,
                                                    maxWidth: widths.code,
                                                }}
                                                className={cn(
                                                    "sticky z-20 p-2 font-mono text-[11px] font-bold border-r border-border shadow-[2px_0_4px_-1px_rgba(0,0,0,0.1)] truncate",
                                                    isInactive
                                                        ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200 border-r-red-300"
                                                        : "bg-card dark:bg-slate-950 text-[#183260] dark:text-cyan-400"
                                                )}
                                            >
                                                {emp.employee_code}
                                            </td>

                                            <td
                                                style={{
                                                    width: widths.designation,
                                                    minWidth: widths.designation,
                                                    maxWidth: widths.designation,
                                                }}
                                                className={cn(
                                                    "p-2 truncate",
                                                    isInactive
                                                        ? "bg-red-50/90 text-red-900/80 dark:bg-red-950/60 dark:text-red-200/80"
                                                        : "text-muted-foreground"
                                                )}
                                            >
                                                {emp.designation || "—"}
                                            </td>

                                            <td
                                                style={{
                                                    width: widths.location,
                                                    minWidth: widths.location,
                                                    maxWidth: widths.location,
                                                }}
                                                className={cn(
                                                    "p-2 truncate",
                                                    isInactive
                                                        ? "bg-red-50/90 text-red-900/80 dark:bg-red-950/60 dark:text-red-200/80"
                                                        : "text-muted-foreground"
                                                )}
                                            >
                                                {emp.location || "—"}
                                            </td>

                                            {Array.from({ length: daysInMonth }, (_, i) => {
                                                const dayNum = i + 1;
                                                const status = emp.attendance?.[dayNum];
                                                const config = getStatusConfig(status);
                                                const d = new Date(selectedYear, selectedMonth - 1, dayNum);
                                                const isSun = d.getDay() === 0;
                                                const isFuture = isFutureDate(selectedYear, selectedMonth, dayNum);
                                                const isToday = !isFuture && d.toDateString() === today.toDateString();

                                                return (
                                                    <td
                                                        key={dayNum}
                                                        style={{
                                                            width: widths.day,
                                                            minWidth: widths.day,
                                                            maxWidth: widths.day,
                                                        }}
                                                        onClick={() => {
                                                            if (isInactive) {
                                                                const dtMsg = emp.inactive_date ? ` (${new Date(emp.inactive_date).toLocaleDateString("en-IN")} ko Inactive hue)` : "";
                                                                toast.error(`Employee ${emp.name} Inactive hai${dtMsg}. Attendance fill nahi ho sakti.`);
                                                                return;
                                                            }
                                                            if (isFuture) {
                                                                toast.error(`Future date (Day ${dayNum}) blocked hai. Sirf aaj tak attendance lag sakti hai.`);
                                                                return;
                                                            }
                                                            handleCellClick(emp, dayNum);
                                                        }}
                                                        className={cn(
                                                            "p-0.5 text-center select-none transition border-r border-border/30",
                                                            isInactive
                                                                ? "bg-red-50/90 dark:bg-red-950/60 border-r-red-200/60 cursor-not-allowed"
                                                                : isFuture
                                                                ? "cursor-not-allowed"
                                                                : "cursor-pointer hover:ring-1 hover:ring-primary",
                                                            !isInactive && isToday && !status && "bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-blue-300",
                                                            !isInactive && isSun && !status && "bg-red-50/30 dark:bg-red-950/20"
                                                        )}
                                                        title={
                                                            isInactive
                                                                ? `${emp.name} is Inactive${emp.inactive_date ? ` since ${new Date(emp.inactive_date).toLocaleDateString("en-IN")}` : ""} — Attendance Blocked`
                                                                : isFuture
                                                                ? `Day ${dayNum} (Future Date) - Blocked`
                                                                : `${emp.name} - Day ${dayNum}: ${status ? (STATUS_CONFIG[status]?.label || status) : "Unmarked"}${emp.ot?.[dayNum] ? ` | OT: ${emp.ot[dayNum].ot_hours} Hours${emp.ot[dayNum].ot_remarks ? ` (${emp.ot[dayNum].ot_remarks})` : ""}` : ""}`
                                                        }
                                                    >
                                                        <div className="relative inline-flex items-center justify-center">
                                                            {config ? (
                                                                <div
                                                                    className={cn(
                                                                        "h-6 w-6 mx-auto rounded flex items-center justify-center text-[10px] font-bold border",
                                                                        config.bg,
                                                                        isInactive && "opacity-40 grayscale contrast-125",
                                                                        isFuture && "opacity-75"
                                                                    )}
                                                                >
                                                                    {config?.code || (status === "L" ? "PL" : status)}
                                                                </div>
                                                            ) : (
                                                                <div
                                                                    className={cn(
                                                                        "h-6 w-6 mx-auto rounded border",
                                                                        isInactive
                                                                            ? "border-red-300/60 bg-red-100/60 dark:bg-red-900/40 cursor-not-allowed"
                                                                            : isFuture
                                                                            ? "border-slate-300 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/70"
                                                                            : isToday
                                                                            ? "border-dashed border-blue-400 bg-blue-50/30"
                                                                            : "border-dashed border-border hover:border-foreground/50"
                                                                    )}
                                                                />
                                                            )}
                                                            {emp.ot?.[dayNum]?.ot_hours > 0 && (
                                                                <span
                                                                    className="absolute -top-1.5 -right-2 bg-amber-600 text-white text-[8px] font-black rounded-xs px-0.5 leading-tight shadow-xs pointer-events-none"
                                                                    title={`OT: ${emp.ot[dayNum].ot_hours} Hours${emp.ot[dayNum].ot_remarks ? ` (${emp.ot[dayNum].ot_remarks})` : ""}`}
                                                                >
                                                                    {emp.ot[dayNum].ot_hours}h
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}

                                            <td
                                                style={{
                                                    width: widths.p,
                                                    minWidth: widths.p,
                                                    maxWidth: widths.p,
                                                }}
                                                className={cn(
                                                    "p-2 text-center font-bold border-l truncate",
                                                    isInactive ? "bg-red-100/70 text-red-950 border-red-300/60" : "text-emerald-700 bg-emerald-50/40 border-border"
                                                )}
                                            >
                                                {s.P || 0}
                                            </td>
                                            <td
                                                style={{
                                                    width: widths.tr,
                                                    minWidth: widths.tr,
                                                    maxWidth: widths.tr,
                                                }}
                                                className={cn(
                                                    "p-2 text-center font-bold truncate",
                                                    isInactive ? "bg-red-100/70 text-red-950" : "text-teal-700 bg-teal-50/40"
                                                )}
                                                title={`${emp.name}: ${s.TR || 0} Travel Days (100% Paid)`}
                                            >
                                                {s.TR || 0}
                                            </td>
                                            <td
                                                style={{
                                                    width: widths.a,
                                                    minWidth: widths.a,
                                                    maxWidth: widths.a,
                                                }}
                                                className={cn(
                                                    "p-2 text-center font-bold truncate",
                                                    isInactive ? "bg-red-100/70 text-red-950" : "text-red-700 bg-red-50/40"
                                                )}
                                            >
                                                {s.A || 0}
                                            </td>
                                            <td
                                                style={{
                                                    width: widths.h,
                                                    minWidth: widths.h,
                                                    maxWidth: widths.h,
                                                }}
                                                className={cn(
                                                    "p-2 text-center font-bold truncate",
                                                    isInactive ? "bg-red-100/70 text-red-950" : "text-amber-700 bg-amber-50/40"
                                                )}
                                                title={`${emp.name}: ${s.H || 0} Half Days (0.5 Cut)`}
                                            >
                                                {s.H || 0}
                                            </td>
                                            <td
                                                style={{
                                                    width: widths.hd,
                                                    minWidth: widths.hd,
                                                    maxWidth: widths.hd,
                                                }}
                                                className={cn(
                                                    "p-2 text-center font-bold truncate",
                                                    isInactive ? "bg-red-100/70 text-red-950" : "text-lime-800 bg-lime-50/40"
                                                )}
                                                title={`${emp.name}: ${(s.HD || 0) + (s.HP || 0)} Half Days (No Deduction)`}
                                            >
                                                {(s.HD || 0) + (s.HP || 0)}
                                            </td>
                                            <td
                                                style={{
                                                    width: widths.pl,
                                                    minWidth: widths.pl,
                                                    maxWidth: widths.pl,
                                                }}
                                                className={cn(
                                                    "p-2 text-center font-bold truncate",
                                                    isInactive ? "bg-red-100/70 text-red-950" : "text-blue-700 bg-blue-50/40"
                                                )}
                                            >
                                                {(s.PL || 0) + (s.L || 0)}
                                            </td>
                                            <td
                                                style={{
                                                    width: widths.ul,
                                                    minWidth: widths.ul,
                                                    maxWidth: widths.ul,
                                                }}
                                                className={cn(
                                                    "p-2 text-center font-bold truncate",
                                                    isInactive ? "bg-red-100/70 text-red-950" : "text-rose-700 bg-rose-50/40"
                                                )}
                                            >
                                                {s.UL || 0}
                                            </td>
                                            <td
                                                style={{
                                                    width: widths.wo,
                                                    minWidth: widths.wo,
                                                    maxWidth: widths.wo,
                                                }}
                                                className={cn(
                                                    "p-2 text-center font-medium truncate",
                                                    isInactive ? "bg-red-100/70 text-red-950" : "text-muted-foreground bg-muted/30"
                                                )}
                                            >
                                                {s.WO || 0}
                                            </td>
                                            <td
                                                style={{
                                                    width: widths.hol,
                                                    minWidth: widths.hol,
                                                    maxWidth: widths.hol,
                                                }}
                                                className={cn(
                                                    "p-2 text-center font-medium truncate",
                                                    isInactive ? "bg-red-100/70 text-red-950" : "text-purple-700 bg-purple-50/40"
                                                )}
                                                title={`${emp.name}: ${s.HOL || 0} Holidays (100% Paid)`}
                                            >
                                                {s.HOL || 0}
                                            </td>
                                            <td
                                                style={{
                                                    width: widths.ot,
                                                    minWidth: widths.ot,
                                                    maxWidth: widths.ot,
                                                }}
                                                className={cn(
                                                    "p-2 text-center font-bold truncate",
                                                    isInactive
                                                        ? "bg-red-100/70 text-red-950"
                                                        : (emp.total_ot_hours || 0) > 0
                                                        ? "text-amber-800 bg-amber-50/60 font-black"
                                                        : "text-muted-foreground bg-muted/20"
                                                )}
                                                title={`${emp.name}: ${emp.total_ot_hours || 0} Total Approved OT Hours`}
                                            >
                                                {(emp.total_ot_hours || 0) > 0 ? `${emp.total_ot_hours}h` : "—"}
                                            </td>
                                            <td
                                                style={{
                                                    width: widths.present_days,
                                                    minWidth: widths.present_days,
                                                    maxWidth: widths.present_days,
                                                }}
                                                className={cn(
                                                    "p-2 text-center font-extrabold border-l truncate",
                                                    isInactive ? "bg-red-200/80 text-red-950 border-red-300" : "text-foreground bg-muted/60 border-border"
                                                )}
                                            >
                                                {presentTotal}
                                            </td>
                                            {/* ── NEW: Salary Calculation Column ── */}
                                            <td
                                                style={{
                                                    width: widths.salary_calc,
                                                    minWidth: widths.salary_calc,
                                                    maxWidth: widths.salary_calc,
                                                }}
                                                className={cn(
                                                    "p-2 text-center border-l",
                                                    isInactive ? "bg-red-100/70 border-red-300/60" : "bg-indigo-50/30 dark:bg-indigo-950/10 border-border"
                                                )}
                                            >
                                                <button
                                                    onClick={() => handleViewSalary(emp)}
                                                    className={cn(
                                                        "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-bold transition whitespace-nowrap shadow-xs",
                                                        isInactive
                                                            ? "border-red-300 bg-red-100/90 text-red-800 hover:bg-red-200/80"
                                                            : "border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/60 dark:border-indigo-700 dark:text-indigo-300"
                                                    )}
                                                    title={`Calculate salary for ${emp.name}`}
                                                >
                                                    <span className="text-[11px]">₹</span>
                                                    View Salary
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="border-t border-border bg-muted/30 p-3 text-xs text-muted-foreground flex flex-col sm:flex-row justify-between items-center gap-2">
                    <div>
                        {isClosed ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="h-4 w-4" /> Attendance verified and closed by {attendanceData?.closed_by || "HR Admin"} on {attendanceData?.closed_at ? new Date(attendanceData.closed_at).toLocaleDateString("en-IN") : ""}
                            </span>
                        ) : (
                            <span className="text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
                                <AlertCircle className="h-4 w-4" /> Please verify all days before closing attendance. Once closed, records are locked for Salary processing.
                            </span>
                        )}
                    </div>
                    <div className="text-[11px] text-muted-foreground/70">
                        Formula: Present Days = Present + Travel (TR) + Paid Leave (PL) + Half Day (HD) + (Half Day (H) × 0.5)  |  Unpaid Leave (UL) is deducted from salary
                    </div>
                </div>
            </div>

            {/* POPUP: MARK ATTENDANCE STATUS FOR A SINGLE CELL */}
            {selectedCell && (
                <Dialog open={Boolean(selectedCell)} onOpenChange={() => setSelectedCell(null)}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-base font-bold text-foreground">
                                Mark Attendance: Day {selectedCell.day} ({MONTH_NAMES[selectedMonth - 1]})
                            </DialogTitle>
                            <DialogDescription className="text-xs">
                                Employee: <b>{selectedCell.employee.name}</b> ({selectedCell.employee.employee_code})
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid grid-cols-2 gap-2.5 py-3">
                            {Object.entries(STATUS_CONFIG).filter(([code]) => code !== "L").map(([code, config]) => (
                                <button
                                    key={code}
                                    type="button"
                                    onClick={() => handleSetStatus(code)}
                                    className={cn(
                                        "flex items-center gap-3 p-3 rounded-xl border text-left transition hover:scale-[1.02] shadow-xs",
                                        (selectedCell.currentStatus === code || (code === "PL" && selectedCell.currentStatus === "L") || (code === "HD" && selectedCell.currentStatus === "HP")) ? "ring-2 ring-primary font-bold" : "",
                                        config.bg,
                                        code === "HOL" && "col-span-2"
                                    )}
                                >
                                    <span className={cn("grid h-7 w-7 place-items-center rounded-lg font-black text-xs shrink-0", config.badgeBg)}>
                                        {code}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold truncate">{config.label}</p>
                                        <p className="text-[10px] opacity-80 leading-tight">{config.sub || code}</p>
                                    </div>
                                </button>
                            ))}

                            {/* 9th Option: OT - Overtime */}
                            <button
                                type="button"
                                onClick={handleOpenOTModal}
                                className={cn(
                                    "col-span-2 flex items-center justify-between p-3 rounded-xl border text-left transition hover:scale-[1.01] shadow-xs bg-amber-50 text-amber-950 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800",
                                    selectedCell.currentOT ? "ring-2 ring-amber-500 font-bold" : ""
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="grid h-7 w-7 place-items-center rounded-lg font-black text-xs shrink-0 bg-amber-600 text-white">
                                        OT
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold truncate">OT – Overtime</p>
                                        <p className="text-[10px] opacity-80 leading-tight">
                                            {selectedCell.currentOT ? `${selectedCell.currentOT.ot_hours} Hours Logged (Click to Edit)` : "Record extra working hours"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
                                    <Clock className="h-4 w-4" />
                                    {selectedCell.currentOT ? `${selectedCell.currentOT.ot_hours} hrs` : "Add OT"}
                                </div>
                            </button>
                        </div>

                        {selectedCell.currentStatus && (
                            <div className="pt-2 border-t">
                                <button
                                    type="button"
                                    onClick={() => handleSetStatus("CLEAR")}
                                    className="w-full flex items-center justify-center gap-1.5 p-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition"
                                >
                                    <X className="h-3.5 w-3.5" />
                                    Clear / Remove Attendance for Day {selectedCell.day}
                                </button>
                            </div>
                        )}

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setSelectedCell(null)}>
                                Cancel
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* POPUP: OVERTIME (OT) ENTRY MODAL */}
            {otModalOpen && (
                <Dialog open={otModalOpen} onOpenChange={setOtModalOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-base font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                                <Clock className="h-5 w-5 text-amber-600" />
                                Record Overtime (OT)
                            </DialogTitle>
                            <DialogDescription className="text-xs">
                                Enter extra working hours for this date. Existing attendance status remains unchanged.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-3 py-2 text-xs">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                                        Employee Name
                                    </label>
                                    <Input
                                        value={otData.employee?.name || ""}
                                        disabled
                                        className="h-8 text-xs bg-muted font-semibold text-foreground cursor-not-allowed"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                                        Employee Code
                                    </label>
                                    <Input
                                        value={otData.employee?.employee_code || ""}
                                        disabled
                                        className="h-8 text-xs bg-muted font-mono font-semibold text-foreground cursor-not-allowed"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                                    Attendance Date
                                </label>
                                <Input
                                    value={
                                        otData.day
                                            ? `${String(otData.day).padStart(2, "0")} ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`
                                            : ""
                                    }
                                    disabled
                                    className="h-8 text-xs bg-muted font-semibold text-foreground cursor-not-allowed"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] uppercase font-bold text-foreground block mb-1">
                                    Overtime Hours (Manual Entry) <span className="text-red-500">*</span>
                                </label>
                                <Input
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    max="24"
                                    placeholder="e.g. 2, 3.5, 4"
                                    value={otData.hours}
                                    onChange={(e) => setOtData({ ...otData, hours: e.target.value })}
                                    className="h-8 text-xs bg-background font-bold text-amber-900 dark:text-amber-200"
                                    autoFocus
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    Salary Formula: (Salary / {daysInMonth} / 12) × OT Hours
                                </p>
                            </div>

                            <div>
                                <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                                    Remarks (Optional)
                                </label>
                                <Input
                                    placeholder="e.g. Night shift emergency production"
                                    value={otData.remarks}
                                    onChange={(e) => setOtData({ ...otData, remarks: e.target.value })}
                                    className="h-8 text-xs bg-background"
                                />
                            </div>
                        </div>

                        <DialogFooter className="gap-2 sm:gap-0">
                            {Boolean(otData.employee?.ot?.[otData.day]) && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleClearOT}
                                    disabled={savingOT}
                                    className="text-xs text-red-600 hover:bg-red-50 hover:text-red-700 mr-auto"
                                >
                                    Clear OT
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => setOtModalOpen(false)} disabled={savingOT}>
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleSaveOT}
                                disabled={savingOT}
                                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs"
                            >
                                {savingOT ? "Saving..." : "Save Overtime"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* VERIFY & CLOSE ATTENDANCE CONFIRMATION MODAL */}
            <Dialog open={closeModalOpen} onOpenChange={setCloseModalOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-emerald-700 flex items-center gap-2">
                            <Lock className="h-5 w-5" /> Verify & Close Attendance
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Month: <b>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</b>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2 text-xs">
                        {missingEntriesSummary.missingCount > 0 ? (
                            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3.5 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-1">
                                <div className="flex items-center gap-1.5 font-bold">
                                    <AlertCircle className="h-4 w-4 text-amber-600" />
                                    Notice: Missing Attendance Entries Detected
                                </div>
                                <p className="text-amber-800 dark:text-amber-300">
                                    There are <b>{missingEntriesSummary.missingCount}</b> date slots not yet marked out of {missingEntriesSummary.totalSlots} total employee-day slots.
                                </p>
                                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                                    Unmarked days will default to Absent in salary calculation unless filled. You can still close if intentional.
                                </p>
                            </div>
                        ) : (
                            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-3.5 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                                <div>
                                    <p className="font-bold">All Attendance Records Complete!</p>
                                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400">All active staff attendance is filled for this month.</p>
                                </div>
                            </div>
                        )}

                        <div className="rounded-lg border p-3 bg-muted/30 space-y-2">
                            <p className="font-semibold text-foreground">What happens after closing?</p>
                            <ul className="list-disc list-inside space-y-1 text-muted-foreground text-[11px]">
                                <li>Attendance records for {MONTH_NAMES[selectedMonth - 1]} {selectedYear} will be <b>locked</b>.</li>
                                <li>Verified attendance will become available for <b>Salary Generation</b>.</li>
                                <li>Only authorized Super Admin can reopen with an audit log.</li>
                            </ul>
                        </div>

                        <div>
                            <label className="font-semibold text-foreground block mb-1">Audit Closing Notes (Optional)</label>
                            <Input
                                placeholder="e.g. Verified by HR Manager, all overtime confirmed"
                                value={closeNotes}
                                onChange={(e) => setCloseNotes(e.target.value)}
                                className="h-8 text-xs bg-background"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCloseModalOpen(false)} disabled={closingAction}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirmClose}
                            disabled={closingAction}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                        >
                            {closingAction ? "Locking Attendance..." : "Confirm & Lock Attendance"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* REOPEN ATTENDANCE MODAL */}
            <Dialog open={reopenModalOpen} onOpenChange={setReopenModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                            <Unlock className="h-5 w-5 text-amber-600" /> Reopen Attendance for Editing
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Month: <b>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</b>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-2 space-y-3 text-xs">
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                            <p className="font-semibold">After unlocking:</p>
                            <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1">
                                The attendance register will be unlocked for editing. You can click any date to update or correct employee attendance. Once done, click <b>"Verify & Close Attendance"</b> to lock it again.
                            </p>
                        </div>

                        <div>
                            <label className="font-semibold text-foreground block mb-1">Reason / Note (Optional)</label>
                            <Input
                                placeholder="e.g. Attendance correction / leave adjustment"
                                value={reopenNotes}
                                onChange={(e) => setReopenNotes(e.target.value)}
                                className="h-8 text-xs bg-background"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReopenModalOpen(false)} disabled={closingAction}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirmReopen}
                            disabled={closingAction}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                        >
                            {closingAction ? "Unlocking..." : "Confirm & Unlock Attendance"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── SALARY CALCULATION MODAL ── */}
            {salaryModalOpen && selectedSalaryEmployee && (
                <SalaryCalculationModal
                    open={salaryModalOpen}
                    onClose={() => {
                        setSalaryModalOpen(false);
                        setSelectedSalaryEmployee(null);
                    }}
                    employee={selectedSalaryEmployee}
                    month={selectedMonth}
                    year={selectedYear}
                />
            )}
        </div>
    );
}
