import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import PurchaseOrders from "./pages/PurchaseOrders";
import WorkOrders from "./pages/WorkOrders";
import Sales from "./pages/Sales";
import CreditNotes from "./pages/CreditNotes";
import Inventory from "./pages/Inventory";
import Clients from "./pages/Clients";
import Reports from "./pages/Reports";
import UserApprovals from "./pages/UserApprovals";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import NotFound from "./pages/NotFound";
import CompanyAddresses from "./pages/CompanyAddresses";
import SystemBackup from "./pages/SystemBackup";
import RecentlyDeleted from "./pages/RecentlyDeleted";
import SoftwareSelection from "./pages/SoftwareSelection";
import StorePurchase from "./pages/StorePurchase";
import ApplicationAccessManagement from "./pages/ApplicationAccessManagement";
import POApprovalSettings from "./pages/POApprovalSettings";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
        },
    },
});

const ProtectedRoute = ({ children }) => {
    const { isAuthenticated } = useAuth();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    return children;
};

const GuestRoute = ({ children }) => {
    const { isAuthenticated } = useAuth();
    if (isAuthenticated) return <Navigate to="/" replace />;
    return children;
};

const AdminRoute = ({ children }) => {
    const { isAuthenticated, user } = useAuth();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (!user?.is_admin) return <Navigate to="/" replace />;
    return children;
};

const MarketingRoute = ({ children }) => {
    const { isAuthenticated, applicationRole } = useAuth();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    return applicationRole("marketing") === "none" ? <Navigate to="/" replace /> : children;
};

const SuperAdminRoute = ({ children }) => {
    const { isAuthenticated, user } = useAuth();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    return user?.is_super_admin ? children : <Navigate to="/" replace />;
};

const StorePurchaseRoute = ({ children }) => {
    const { isAuthenticated, applicationRole } = useAuth();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    return applicationRole("store_purchase") === "none" ? <Navigate to="/" replace /> : children;
};

const App = () => (
    <QueryClientProvider client={queryClient}>
        <ThemeProvider>
            <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                    <AuthProvider>
                        <Routes>
                            {/* Auth routes — only accessible when NOT logged in */}
                            <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
                            <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
                            <Route path="/forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />

                            {/* Protected app routes */}
                            <Route path="/" element={<ProtectedRoute><SoftwareSelection /></ProtectedRoute>} />
                            <Route path="/marketing" element={<MarketingRoute><AppLayout><Dashboard /></AppLayout></MarketingRoute>} />
                            <Route path="/purchase-orders" element={<MarketingRoute><AppLayout><PurchaseOrders /></AppLayout></MarketingRoute>} />
                            <Route path="/work-orders" element={<MarketingRoute><AppLayout><WorkOrders /></AppLayout></MarketingRoute>} />
                            <Route path="/sales-invoice" element={<MarketingRoute><AppLayout><Sales /></AppLayout></MarketingRoute>} />
                            <Route path="/credit-notes" element={<MarketingRoute><AppLayout><CreditNotes /></AppLayout></MarketingRoute>} />
                            <Route path="/inventory" element={<MarketingRoute><AppLayout><Inventory /></AppLayout></MarketingRoute>} />
                            <Route path="/clients" element={<MarketingRoute><AppLayout><Clients /></AppLayout></MarketingRoute>} />
                            <Route path="/reports" element={<MarketingRoute><AppLayout><Reports /></AppLayout></MarketingRoute>} />
                            <Route path="/user-approvals" element={<SuperAdminRoute><AppLayout><UserApprovals /></AppLayout></SuperAdminRoute>} />
                            <Route path="/admin/addresses" element={<MarketingRoute><AdminRoute><AppLayout><CompanyAddresses /></AppLayout></AdminRoute></MarketingRoute>} />
                            <Route path="/admin/system-backup" element={<MarketingRoute><AdminRoute><AppLayout><SystemBackup /></AppLayout></AdminRoute></MarketingRoute>} />
                            <Route path="/admin/recently-deleted" element={<MarketingRoute><AdminRoute><AppLayout><RecentlyDeleted /></AppLayout></AdminRoute></MarketingRoute>} />
                            <Route path="/admin/application-access" element={<SuperAdminRoute><ApplicationAccessManagement /></SuperAdminRoute>} />
                            <Route path="/admin/po-approval-settings" element={<SuperAdminRoute><POApprovalSettings /></SuperAdminRoute>} />
                            <Route path="/store-purchase/*" element={<StorePurchaseRoute><StorePurchase /></StorePurchaseRoute>} />
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </AuthProvider>
                </BrowserRouter>
            </TooltipProvider>
        </ThemeProvider>
    </QueryClientProvider>
);

export default App;
