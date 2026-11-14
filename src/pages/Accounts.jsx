import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AccountsSidebar from "@/components/layout/AccountsSidebar";
import StoreAccounts from "@/components/accounts/StoreAccounts";
import MarketingAccounts from "@/components/accounts/MarketingAccounts";
import { Topbar } from "@/components/layout/Topbar";

export default function Accounts() {
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <div className="min-h-screen bg-background lg:flex">
            {/* Sidebar */}
            <AccountsSidebar mobileOpen={mobileOpen} onOpenChange={setMobileOpen} />

            {/* Main Area */}
            <div className="min-w-0 flex-1 flex flex-col">
                {/* Unified Topbar matching Store & Marketing */}
                <Topbar
                    title="Accounts Dashboard"
                    subtitle="Store & Marketing Accounts Management"
                    searchPlaceholder="Search vendor, item, PO, invoice..."
                    onMenu={() => setMobileOpen(true)}
                />

                {/* Sub-routes */}
                <main className="flex-1 overflow-y-auto">
                    <Routes>
                        <Route path="store" element={<StoreAccounts />} />
                        <Route path="marketing" element={<MarketingAccounts />} />
                        <Route path="*" element={<Navigate to="store" replace />} />
                    </Routes>
                </main>
            </div>
        </div>
    );
}
