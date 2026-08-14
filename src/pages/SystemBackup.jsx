import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, Upload, AlertTriangle, ShieldCheck } from "lucide-react";

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");

export default function SystemBackup() {
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [fileToImport, setFileToImport] = useState(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [understood, setUnderstood] = useState(false);
    const fileInputRef = useRef(null);

    const handleExport = async () => {
        try {
            setIsExporting(true);
            const token = localStorage.getItem("token") || localStorage.getItem("auth_token");
            const res = await fetch(`${BASE}/api/system/backup/export`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || "Failed to export database");
            }
            
            // Handle file download
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            
            // Try to extract filename from content-disposition header if possible
            const disposition = res.headers.get("Content-Disposition");
            let filename = "database_backup.json";
            if (disposition && disposition.indexOf("filename=") !== -1) {
                const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
                if (filenameMatch && filenameMatch.length === 2) {
                    filename = filenameMatch[1];
                }
            }
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            toast.success("Database exported successfully!");
        } catch (error) {
            toast.error(error.message || "Export failed");
        } finally {
            setIsExporting(false);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setFileToImport(e.target.files[0]);
            setShowConfirm(true);
        }
    };

    const handleConfirmImport = async () => {
        if (!fileToImport) return;
        
        setShowConfirm(false);
        setIsImporting(true);
        
        try {
            const formData = new FormData();
            formData.append("file", fileToImport);
            
            const token = localStorage.getItem("token") || localStorage.getItem("auth_token");
            const res = await fetch(`${BASE}/api/system/backup/import`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: formData
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.detail || "Failed to import database");
            }
            
            toast.success(data.detail || "Database imported successfully");
            setFileToImport(null);
            setUnderstood(false);
            
            // Reload page to reflect new state
            setTimeout(() => {
                window.location.reload();
            }, 1500);
            
        } catch (error) {
            toast.error(error.message || "Import failed");
            setFileToImport(null);
            setUnderstood(false);
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const cancelImport = () => {
        setShowConfirm(false);
        setFileToImport(null);
        setUnderstood(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">System Backup & Restore</h2>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2">
                <Card className="p-6 flex flex-col items-center justify-center text-center space-y-4 border-2">
                    <div className="p-4 bg-primary/10 rounded-full">
                        <Download className="h-10 w-10 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold">Export Database</h3>
                        <p className="text-muted-foreground mt-2 max-w-[300px]">
                            Download a complete JSON backup of the entire database. Includes all Purchase Orders, Work Orders, Sales, Items, and Activity Logs.
                        </p>
                    </div>
                    <Button 
                        size="lg" 
                        className="w-full max-w-[250px] mt-4" 
                        onClick={handleExport}
                        disabled={isExporting}
                    >
                        {isExporting ? "Exporting..." : "Export Full Backup"}
                    </Button>
                </Card>
                
                <Card className="p-6 flex flex-col items-center justify-center text-center space-y-4 border-2">
                    <div className="p-4 bg-destructive/10 rounded-full">
                        <Upload className="h-10 w-10 text-destructive" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold">Import Database</h3>
                        <p className="text-muted-foreground mt-2 max-w-[300px]">
                            Restore the system from a previous JSON backup file. <br/>
                            <strong className="text-destructive">Warning: This will overwrite and replace all current data.</strong>
                        </p>
                    </div>
                    
                    <input 
                        type="file" 
                        accept=".json" 
                        className="hidden" 
                        ref={fileInputRef} 
                        onChange={handleFileChange}
                    />
                    
                    <Button 
                        size="lg" 
                        variant="destructive"
                        className="w-full max-w-[250px] mt-4" 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                    >
                        {isImporting ? "Importing..." : "Import Backup File"}
                    </Button>
                </Card>
            </div>
            
            {/* Confirmation Dialog */}
            <Dialog open={showConfirm} onOpenChange={(open) => !open && cancelImport()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center text-destructive">
                            <AlertTriangle className="mr-2 h-5 w-5" />
                            CRITICAL WARNING: DATA REPLACEMENT
                        </DialogTitle>
                        <DialogDescription className="pt-4 text-base space-y-4">
                            <p>
                                You are about to restore the database from the file: <br/>
                                <strong className="text-foreground">{fileToImport?.name}</strong>
                            </p>
                            <p>
                                This action will <strong>DELETE ALL CURRENT DATA</strong> in the system and replace it entirely with the contents of the backup file. Any changes made since this backup was taken will be permanently lost.
                            </p>
                            <div className="flex items-center space-x-2 mt-4 p-4 border rounded bg-muted/50">
                                <Checkbox 
                                    id="understand" 
                                    checked={understood} 
                                    onCheckedChange={(checked) => setUnderstood(checked)} 
                                />
                                <label
                                    htmlFor="understand"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    I understand that all current data will be erased and replaced.
                                </label>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={cancelImport}>Cancel</Button>
                        <Button 
                            variant="destructive" 
                            disabled={!understood || isImporting} 
                            onClick={handleConfirmImport}
                        >
                            {isImporting ? "Restoring..." : "Proceed with Restore"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
