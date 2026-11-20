import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
    Users,
    UserCheck,
    CalendarCheck,
    CalendarX,
    IndianRupee,
    CheckCircle2,
    Clock,
    UserPlus,
    CalendarDays,
    Calendar,
    Lock,
    History,
} from "lucide-react";
import { fetchHRDashboard } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const StatCard = ({ icon: Icon, label, value, detail, accent = "bg-blue-50 text-blue-700", iconBg = "bg-blue-100" }) => (
    <div className="rounded-xl border border-border/70 bg-card p-5 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
            <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{value}</p>
                {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
            </div>
            <div className={`grid h-12 w-12 place-items-center rounded-xl ${iconBg} ${accent}`}>
                <Icon className="h-6 w-6" />
            </div>
        </div>
    </div>
);

export default function HRDashboard() {
    const navigate = useNavigate();
    const today = new Date();
    const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(today.getFullYear());

    const { data: stats, isLoading } = useQuery({
        queryKey: ["hr-dashboard", selectedMonth, selectedYear],
        queryFn: () => fetchHRDashboard({ month: selectedMonth, year: selectedYear }),
        refetchInterval: 30000,
    });

    const formatCurrency = (val) => {
        const num = Number(val || 0);
        return "₹" + num.toLocaleString("en-IN", { maximumFractionDigits: 0 });
    };

    const isCurrentMonth = selectedMonth === today.getMonth() + 1 && selectedYear === today.getFullYear();
    const monthName = MONTH_NAMES[selectedMonth - 1];

    return (
        <div className="space-y-6">
            {/* Top Banner / Welcome */}
            <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-slate-950 via-[#132c58] to-indigo-900 p-6 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-8">
                <div>
                    <span className="inline-block rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-300 backdrop-blur-sm border border-cyan-400/30">
                        Human Resource Management System
                    </span>
                    <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">HR Department Dashboard</h1>
                    <p className="mt-1 text-xs text-slate-300 sm:text-sm">
                        Real-time overview of workforce, attendance status, and monthly salary processing.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        onClick={() => navigate("/hr/employees")}
                        variant="secondary"
                        className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow font-semibold text-xs"
                    >
                        <UserPlus className="mr-1.5 h-4 w-4" />
                        Manage Employees
                    </Button>
                    <Button
                        onClick={() => navigate("/hr/attendance")}
                        variant="outline"
                        className="border-white/30 bg-white/10 text-white hover:bg-white/20 text-xs"
                    >
                        <CalendarDays className="mr-1.5 h-4 w-4" />
                        Attendance Register
                    </Button>
                </div>
            </div>

            {/* ─── Month & Year Selector Bar (To view previous months) ─── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-card p-4 rounded-xl border border-border shadow-xs">
                <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-foreground uppercase tracking-wider">
                        <Calendar className="h-4 w-4 text-primary" />
                        <span>Select Period:</span>
                    </div>

                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(Number(e.target.value))}
                        className="h-8.5 rounded-lg border border-input bg-background px-3 text-xs font-semibold text-foreground focus:ring-1 focus:ring-primary"
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
                        className="h-8.5 rounded-lg border border-input bg-background px-3 text-xs font-semibold text-foreground focus:ring-1 focus:ring-primary"
                    >
                        {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                            <option key={y} value={y}>
                                {y}
                            </option>
                        ))}
                    </select>

                    {!isCurrentMonth && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSelectedMonth(today.getMonth() + 1);
                                setSelectedYear(today.getFullYear());
                            }}
                            className="h-8 text-xs text-primary hover:bg-primary/10"
                        >
                            Reset to Current Month
                        </Button>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground mr-1">
                        Viewing: <b className="text-foreground">{monthName} {selectedYear}</b>
                    </span>
                    {stats?.is_attendance_closed ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-3 py-1 text-xs font-bold border border-emerald-300">
                            <Lock className="h-3.5 w-3.5 text-emerald-600" />
                            Attendance: Verified & Locked
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-3 py-1 text-xs font-bold border border-amber-300">
                            <Clock className="h-3.5 w-3.5 text-amber-600" />
                            Attendance: Open for Marking
                        </span>
                    )}
                </div>
            </div>

            {/* Summary KPI Cards */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    icon={Users}
                    label="Total Employees"
                    value={isLoading ? "—" : (stats?.total_employees ?? 0)}
                    detail="Registered staff"
                    iconBg="bg-blue-50"
                    accent="text-blue-700"
                />
                <StatCard
                    icon={UserCheck}
                    label="Active Employees"
                    value={isLoading ? "—" : (stats?.active_employees ?? 0)}
                    detail="Eligible for payroll"
                    iconBg="bg-emerald-50"
                    accent="text-emerald-700"
                />
                <StatCard
                    icon={CalendarCheck}
                    label={isCurrentMonth ? "Employees Present Today" : `Employees Present in ${monthName}`}
                    value={isLoading ? "—" : (isCurrentMonth ? (stats?.present_today ?? 0) : (stats?.employees_present_in_month ?? 0))}
                    detail={isCurrentMonth ? "Marked 'P'/'TR' today" : `Total employees attended in ${monthName}`}
                    iconBg="bg-teal-50"
                    accent="text-teal-700"
                />
                <StatCard
                    icon={CalendarX}
                    label={isCurrentMonth ? "Employees on Leave Today" : `Employees on Leave in ${monthName}`}
                    value={isLoading ? "—" : (isCurrentMonth ? (stats?.on_leave_today ?? 0) : (stats?.employees_on_leave_in_month ?? 0))}
                    detail={isCurrentMonth ? "Leave or Absent today" : `Total employees on leave in ${monthName}`}
                    iconBg="bg-amber-50"
                    accent="text-amber-700"
                />
            </section>

            {/* Salary KPI Cards (Dynamic for Selected Month) */}
            <section className="grid gap-4 sm:grid-cols-3">
                <StatCard
                    icon={IndianRupee}
                    label={`${monthName} Total Salary`}
                    value={isLoading ? "—" : formatCurrency(stats?.monthly_salary_total)}
                    detail={stats?.salaries_count ? `${stats.salaries_count} employees processed` : "No salaries generated yet"}
                    iconBg="bg-blue-50"
                    accent="text-[#183260]"
                />
                <StatCard
                    icon={CheckCircle2}
                    label={`${monthName} Salary Paid`}
                    value={isLoading ? "—" : formatCurrency(stats?.salary_paid)}
                    detail="Transferred / Marked Paid"
                    iconBg="bg-emerald-50"
                    accent="text-emerald-700"
                />
                <StatCard
                    icon={Clock}
                    label={`${monthName} Salary Pending`}
                    value={isLoading ? "—" : formatCurrency(stats?.salary_pending)}
                    detail="Pending approval / payment"
                    iconBg="bg-amber-50"
                    accent="text-amber-700"
                />
            </section>

            {/* ─── Monthly Records & History ─── */}
            <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
                <div className="border-b border-border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-muted/30">
                    <div>
                        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                            <History className="h-4 w-4 text-primary" />
                            Monthly History & Past Records
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Overview of all past and current months with recorded attendance and salary payouts
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                        <thead>
                            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-[10px] font-bold uppercase tracking-wider select-none border-b border-slate-300 dark:border-slate-700">
                                <th className="p-3 pl-4">Month & Year</th>
                                <th className="p-3 text-center">Attendance Status</th>
                                <th className="p-3 text-center">Employees</th>
                                <th className="p-3 text-right">Total Payout</th>
                                <th className="p-3 text-right">Paid</th>
                                <th className="p-3 text-right">Pending</th>
                                <th className="p-3 pr-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {(!stats?.monthly_history || stats.monthly_history.length === 0) ? (
                                <tr>
                                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                                        No monthly history recorded yet.
                                    </td>
                                </tr>
                            ) : (
                                stats.monthly_history.map((h) => {
                                    const isSelected = h.month === selectedMonth && h.year === selectedYear;
                                    return (
                                        <tr
                                            key={`${h.year}-${h.month}`}
                                            className={cn(
                                                "transition hover:bg-muted/30",
                                                isSelected && "bg-primary/5 font-semibold"
                                            )}
                                        >
                                            <td className="p-3 pl-4 font-bold text-foreground flex items-center gap-2">
                                                <span>{h.month_name} {h.year}</span>
                                                {isSelected && (
                                                    <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.2 rounded">
                                                        Selected
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 text-center">
                                                {h.is_attendance_closed ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200">
                                                        <Lock className="h-3 w-3" /> Closed
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200">
                                                        <Clock className="h-3 w-3" /> Open
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 text-center text-muted-foreground">
                                                {h.salaries_count > 0 ? `${h.salaries_count} staff` : "—"}
                                            </td>
                                            <td className="p-3 text-right font-extrabold text-foreground">
                                                {h.total_payout > 0 ? `₹${Number(h.total_payout).toLocaleString("en-IN")}` : "₹0"}
                                            </td>
                                            <td className="p-3 text-right font-semibold text-emerald-700">
                                                {h.salary_paid > 0 ? `₹${Number(h.salary_paid).toLocaleString("en-IN")}` : "₹0"}
                                            </td>
                                            <td className="p-3 text-right font-semibold text-amber-700">
                                                {h.salary_pending > 0 ? `₹${Number(h.salary_pending).toLocaleString("en-IN")}` : "₹0"}
                                            </td>
                                            <td className="p-3 pr-4 text-center">
                                                <Button
                                                    size="sm"
                                                    variant={isSelected ? "secondary" : "outline"}
                                                    onClick={() => {
                                                        setSelectedMonth(h.month);
                                                        setSelectedYear(h.year);
                                                    }}
                                                    className="h-7 text-xs px-2.5 font-semibold"
                                                >
                                                    {isSelected ? "Current View" : "View Month"}
                                                </Button>
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
    );
}
