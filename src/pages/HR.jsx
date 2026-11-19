import { useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import HRSidebar from "@/components/layout/HRSidebar";
import HRDashboard from "@/components/hr/HRDashboard";
import HREmployees from "@/components/hr/HREmployees";
import HRAttendance from "@/components/hr/HRAttendance";
import HRSalary from "@/components/hr/HRSalary";
import { Topbar } from "@/components/layout/Topbar";
import ErrorBoundary from "@/components/common/ErrorBoundary";

export default function HR() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const location = useLocation();

    const path = location.pathname.split("/")[2] || "";
    let title = "HR Department Dashboard";
    let subtitle = "Human Resource Management System";

    if (path === "employees") {
        title = "Employee Details";
        subtitle = "Staff profiles, KYC documents & banking records";
    } else if (path === "attendance") {
        title = "Attendance Management";
        subtitle = "Monthly visual attendance register & verification";
    } else if (path === "salary") {
        title = "Salary Management";
        subtitle = "Payroll calculation, payment records & salary slips";
    }

    return (
        <div className="min-h-screen bg-background lg:flex">
            {/* Sidebar */}
            <HRSidebar />

            {/* Main Content Area - Full width matching Store and Marketing */}
            <div className="min-w-0 flex-1 flex flex-col">
                <Topbar
                    title={title}
                    subtitle={subtitle}
                    searchPlaceholder="Search employees, designations, records..."
                    onMenu={() => setMobileOpen(true)}
                />

                <main className="flex-1 overflow-y-auto p-4 sm:p-6 w-full">
                    <ErrorBoundary>
                        <Routes>
                            <Route index element={<HRDashboard />} />
                            <Route path="dashboard" element={<HRDashboard />} />
                            <Route path="employees" element={<HREmployees />} />
                            <Route path="attendance" element={<HRAttendance />} />
                            <Route path="salary" element={<HRSalary />} />
                            <Route path="*" element={<Navigate to="" replace />} />
                        </Routes>
                    </ErrorBoundary>
                </main>
            </div>
        </div>
    );
}
