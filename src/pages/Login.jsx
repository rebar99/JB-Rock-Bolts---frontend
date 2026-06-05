import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LogIn, Lock, Mail } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { loginUser } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !password) {
            toast({ title: "Please fill in all fields", variant: "destructive" });
            return;
        }
        setLoading(true);
        try {
            const data = await loginUser({ email, password });
            login(data);
            navigate("/", { replace: true });
        } catch (err) {
            toast({ title: "Login failed", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex">
            {/* Left branding panel — matches sidebar style */}
            <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] shrink-0 flex-col items-center justify-between bg-sidebar text-sidebar-foreground p-10">
                <div className="w-full">
                    <img
                        src="https://jbrockbolts.com/images/rebar-couplers-logo.jpg"
                        alt="JB Rock Bolts"
                        className="w-full max-w-[260px] mx-auto rounded-xl p-2 bg-white shadow-glow"
                    />
                </div>

                <div className="text-center space-y-3">
                    <h1 className="text-2xl font-bold text-white tracking-tight">JB Rock Bolts</h1>
                    <p className="text-sm text-sidebar-foreground/70 leading-relaxed max-w-xs">
                        Marketing &amp; Sales Management System — manage purchase orders, invoices, inventory, and clients from one place.
                    </p>
                </div>

                <div className="rounded-lg bg-sidebar-accent/40 px-4 py-3 w-full text-center">
                    <div className="text-xs font-semibold text-white">Marketing &amp; Sales</div>
                    <div className="text-[11px] text-sidebar-foreground/70 mt-0.5">Management System v2.5</div>
                </div>
            </div>

            {/* Right form panel */}
            <div className="flex-1 flex items-center justify-center bg-background px-6 py-12">
                <div className="w-full max-w-md">
                    {/* Logo visible only on mobile */}
                    <div className="lg:hidden mb-8 flex justify-center">
                        <img
                            src="https://jbrockbolts.com/images/rebar-couplers-logo.jpg"
                            alt="JB Rock Bolts"
                            className="w-48 rounded-xl p-2 bg-white shadow-md"
                        />
                    </div>

                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
                        <p className="mt-1.5 text-sm text-muted-foreground">Sign in to your account to continue</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground" htmlFor="email">
                                Email address
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter your email"
                                    className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-foreground" htmlFor="password">
                                    Password
                                </label>
                                <Link
                                    to="/forgot-password"
                                    className="text-xs font-medium text-primary hover:underline"
                                >
                                    Forgot password?
                                </Link>
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="new-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full h-11 pl-10 pr-10 rounded-lg border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-11 flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition"
                        >
                            {loading ? (
                                <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                            ) : (
                                <LogIn className="h-4 w-4" />
                            )}
                            {loading ? "Signing in…" : "Sign in"}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Don't have an account?{" "}
                        <Link to="/register" className="font-semibold text-primary hover:underline">
                            Create one
                        </Link>
                    </p>


                </div>
            </div>
        </div>
    );
}
