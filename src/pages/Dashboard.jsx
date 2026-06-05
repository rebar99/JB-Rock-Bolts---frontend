import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { inr, fmtDate } from "@/lib/format";
import { fetchDashboardStats, fetchDashboardCharts, fetchRecentSales } from "@/lib/api";
import {
    Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
    Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowUpRight, IndianRupee, Package, Truck, Users, AlertCircle } from "lucide-react";

import { useNavigate } from "react-router-dom";

const StatCard = ({ icon: Icon, label, value, delta, accent, onClick }) => (
    <Card className={`p-5 shadow-card hover:shadow-elegant transition-shadow border-border/60 ${onClick ? "cursor-pointer" : ""}`} onClick={onClick}>
        <div className="flex items-start justify-between">
            <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="mt-2 text-2xl font-bold text-foreground tracking-tight">{value}</div>
                {delta && (
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-success font-medium">
                        <ArrowUpRight className="h-3.5 w-3.5" />{delta}
                    </div>
                )}
            </div>
            <div className={`h-11 w-11 rounded-xl grid place-items-center ${accent ?? "bg-primary/10 text-primary"}`}>
                <Icon className="h-5 w-5" />
            </div>
        </div>
    </Card>
);

const PIE_COLORS = {
    Paid: "hsl(var(--success))",
    Pending: "hsl(var(--warning))",
    Partial: "hsl(var(--primary))",
};

const Dashboard = () => {
    const navigate = useNavigate();
    const { data: stats } = useQuery({ queryKey: ["dashboard-stats"], queryFn: fetchDashboardStats });
    const { data: charts } = useQuery({ queryKey: ["dashboard-charts"], queryFn: fetchDashboardCharts });
    const { data: recent = [] } = useQuery({ queryKey: ["recent-sales"], queryFn: () => fetchRecentSales(100) });

    const paymentPie = (charts?.payment_status || []).map((p) => ({
        ...p,
        color: PIE_COLORS[p.name] || "hsl(var(--muted))",
    }));

    const goToReports = () => navigate("/reports");

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Dashboard Overview</h2>
                <p className="text-sm text-muted-foreground mt-1">Track sales performance, orders and client insights.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard onClick={goToReports} icon={IndianRupee} label="Total Revenue" value={inr(stats?.total_revenue ?? 0)} accent="bg-primary/10 text-primary" />
                <StatCard onClick={goToReports} icon={Package} label="Total Orders" value={String(stats?.total_orders ?? 0)} accent="bg-accent/15 text-accent" />
                <StatCard onClick={goToReports} icon={Users} label="Total Clients" value={String(stats?.total_clients ?? 0)} accent="bg-steel/15 text-steel" />
                <StatCard onClick={goToReports} icon={Truck} label="Delivered" value={String(stats?.delivered_orders ?? 0)} accent="bg-success/15 text-success" />
                <StatCard onClick={goToReports} icon={AlertCircle} label="Pending Payments" value={String(stats?.pending_payments ?? 0)} accent="bg-warning/15 text-warning" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2 p-5 shadow-card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-foreground">Sales by Product</h3>
                        <span className="text-xs text-muted-foreground">Revenue (INR)</span>
                    </div>
                    <div className="h-72">
                        <ResponsiveContainer>
                            <BarChart data={charts?.sales_by_product || []} margin={{ left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
                                <Tooltip
                                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                                    formatter={(v) => inr(v)}
                                />
                                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <Card className="p-5 shadow-card">
                    <h3 className="font-semibold text-foreground mb-4">Payment Status</h3>
                    <div className="h-72">
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={paymentPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                                    {paymentPie.map((e) => <Cell key={e.name} fill={e.color} />)}
                                </Pie>
                                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            <Card className="p-5 shadow-card">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">Monthly Sales Trend</h3>
                </div>
                <div className="h-72">
                    <ResponsiveContainer>
                        <LineChart data={charts?.monthly_trend || []} margin={{ left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
                            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v) => inr(v)} />
                            <Line type="monotone" dataKey="revenue" stroke="hsl(var(--accent))" strokeWidth={3} dot={{ r: 4, fill: "hsl(var(--accent))" }} activeDot={{ r: 6 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            <Card className="shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                    <h3 className="font-semibold text-foreground">Recent Sales</h3>
                </div>
                <div className="overflow-x-auto overflow-y-auto max-h-[450px]">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="text-left font-medium px-5 py-3 bg-muted/50 w-[60px]">S.No.</th>
                                <th className="text-left font-medium px-5 py-3 bg-muted/50">Client</th>
                                <th className="text-left font-medium px-5 py-3 bg-muted/50">Product</th>
                                <th className="text-right font-medium px-5 py-3 bg-muted/50">Price</th>
                                <th className="text-left font-medium px-5 py-3 bg-muted/50">Payment</th>
                                <th className="text-left font-medium px-5 py-3 bg-muted/50">Delivery</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recent.map((r, index) => (
                                <tr key={r.id || index} className="border-t border-border hover:bg-muted/30 transition-colors">
                                    <td className="px-5 py-3 text-muted-foreground font-medium">{index + 1}</td>
                                    <td className="px-5 py-3 font-medium text-foreground">
                                        <div className="max-w-[200px] truncate" title={r.client_name}>{r.client_name}</div>
                                    </td>
                                    <td className="px-5 py-3 text-muted-foreground">
                                        <div className="max-w-[350px] truncate" title={r.product}>{r.product}</div>
                                    </td>
                                    <td className="px-5 py-3 text-right font-semibold whitespace-nowrap">{inr(r.price)}</td>
                                    <td className="px-5 py-3"><StatusBadge status={r.payment_status} /></td>
                                    <td className="px-5 py-3"><StatusBadge status={r.delivery_status} /></td>
                                </tr>
                            ))}
                            {recent.length === 0 && (
                                <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">No sales data yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default Dashboard;
