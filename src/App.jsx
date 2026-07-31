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
import Inventory from "./pages/Inventory";
import Clients from "./pages/Clients";
import Reports from "./pages/Reports";
import UserApprovals from "./pages/UserApprovals";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import NotFound from "./pages/NotFound";

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
                            <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
                            <Route path="/purchase-orders" element={<ProtectedRoute><AppLayout><PurchaseOrders /></AppLayout></ProtectedRoute>} />
                            <Route path="/work-orders" element={<ProtectedRoute><AppLayout><WorkOrders /></AppLayout></ProtectedRoute>} />
                            <Route path="/sales-invoice" element={<ProtectedRoute><AppLayout><Sales /></AppLayout></ProtectedRoute>} />
                            <Route path="/inventory" element={<ProtectedRoute><AppLayout><Inventory /></AppLayout></ProtectedRoute>} />
                            <Route path="/clients" element={<ProtectedRoute><AppLayout><Clients /></AppLayout></ProtectedRoute>} />
                            <Route path="/reports" element={<ProtectedRoute><AppLayout><Reports /></AppLayout></ProtectedRoute>} />
                            <Route path="/user-approvals" element={<AdminRoute><AppLayout><UserApprovals /></AppLayout></AdminRoute>} />
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </AuthProvider>
                </BrowserRouter>
            </TooltipProvider>
        </ThemeProvider>
    </QueryClientProvider>
);

export default App;
