import React from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    handleReload = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        window.location.reload();
    };

    handleHome = () => {
        window.location.href = "/";
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
                    <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 max-w-lg shadow-sm">
                        <div className="grid h-12 w-12 place-items-center rounded-xl bg-destructive/10 text-destructive mx-auto mb-4">
                            <AlertCircle className="h-6 w-6" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900">Something went wrong</h2>
                        <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                            {this.state.error?.message || "An unexpected error occurred while rendering this module."}
                        </p>
                        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                            <Button onClick={this.handleReload} variant="outline" size="sm" className="gap-2">
                                <RefreshCw className="h-4 w-4" /> Try Again
                            </Button>
                            <Button onClick={this.handleHome} size="sm" className="bg-[#183260] hover:bg-[#122548] text-white gap-2">
                                <Home className="h-4 w-4" /> Go to Workspaces
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
