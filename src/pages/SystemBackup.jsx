import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, Upload, AlertTriangle, ShieldCheck } from "lucide-react";

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");

export default function SystemBackup({ workspace = "Marketing" }) {
    const isStore = (workspace || "").toLowerCase() === "store";
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [fileToImport, setFileToImport] = useState(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [understood, setUnderstood] = useState(false);
    const [importMode, setImportMode] = useState("merge");
    const fileInputRef = useRef(null);

    const handleExport = async () => {
        try {
            setIsExporting(true);
            const token = localStorage.getItem("token") || localStorage.getItem("auth_token");
            const scopeParam = isStore ? "store" : "marketing";
            const res = await fetch(`${BASE}/api/system/backup/export?scope=${scopeParam}`, {
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
            
            const disposition = res.headers.get("Content-Disposition");
            let filename = isStore ? "store_backup.json" : "marketing_backup.json";
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
            
            toast.success(isStore ? "Store backup exported successfully!" : "Marketing backup exported successfully!");
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
            formData.append("import_type", importMode);
            formData.append("scope", isStore ? "store" : "marketing");
            
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
            
            if (importMode === "replace") {
                toast.success(isStore ? "Store database replaced successfully!" : "Database replaced successfully!", { duration: 5000 });
            } else if (data.records_inserted !== undefined) {
                toast.success(`Merge Complete! ${data.records_inserted} new records imported. ${data.records_skipped} existing records skipped.`, {
                    duration: 5000,
                });
            } else {
                toast.success(data.detail || "Database imported successfully");
            }
            
            setFileToImport(null);
            setUnderstood(false);
            
            // Reload page to reflect new state
            setTimeout(() => {
                window.location.reload();
            }, 2500);
            
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
                <h2 className="text-3xl font-bold tracking-tight">
                    {isStore ? "Store Purchase Backup & Restore" : "Marketing & Sales Backup & Restore"}
                </h2>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2">
                <Card className="p-6 flex flex-col items-center justify-center text-center space-y-4 border-2">
                    <div className="p-4 bg-primary/10 rounded-full">
                        <Download className="h-10 w-10 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold">
                            {isStore ? "Export Store Database" : "Export Marketing Database"}
                        </h3>
                        <p className="text-muted-foreground mt-2 max-w-[320px]">
                            {isStore
                                ? "Download a complete JSON backup of Store Purchase data. Includes all Purchase Orders, Materials Received, Stock Operations, Vendors, and Store Items."
                                : "Download a complete JSON backup of Marketing & Sales. Includes all Purchase Orders, Work Orders, Sales, Line Items, Dispatches, and Credit Notes."}
                        </p>
                    </div>
                    <Button 
                        size="lg" 
                        className="w-full max-w-[250px] mt-4" 
                        onClick={handleExport}
                        disabled={isExporting}
                    >
                        {isExporting ? "Exporting..." : (isStore ? "Export Store Backup" : "Export Marketing Backup")}
                    </Button>
                </Card>
                
                <Card className="p-6 flex flex-col items-center justify-center text-center space-y-4 border-2">
                    <div className="p-4 bg-primary/10 rounded-full">
                        <ShieldCheck className="h-10 w-10 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold">
                            {isStore ? "Merge Store Database Backup" : "Merge Marketing Database Backup"}
                        </h3>
                        <p className="text-muted-foreground mt-2 max-w-[320px]">
                            {isStore
                                ? "Restore Store Purchase from a previous JSON backup file. Existing Store data will not be deleted."
                                : "Restore Marketing & Sales from a previous JSON backup file. Existing data will not be deleted."}
                            <br/>
                            <strong className="text-primary">This is a safe merge. Existing records will be preserved.</strong>
                        </p>
                    </div>
                    
                    <input 
                        type="file" 
                        accept=".json" 
                        className="hidden" 
                        ref={fileInputRef} 
                        onChange={handleFileChange}
                    />
                    
                    <div className="flex w-full max-w-[250px] flex-col gap-3 mt-4">
                        <Button 
                            className="w-full" 
                            onClick={() => { setImportMode("merge"); fileInputRef.current?.click(); }}
                            disabled={isImporting}
                        >
                            {isImporting && importMode === "merge"
                                ? "Merging..."
                                : (isStore ? "Merge Store Backup" : "Merge Marketing Backup")}
                        </Button>
                        <Button 
                            variant="destructive"
                            className="w-full bg-red-600 hover:bg-red-700" 
                            onClick={() => { setImportMode("replace"); fileInputRef.current?.click(); }}
                            disabled={isImporting}
                        >
                            {isImporting && importMode === "replace"
                                ? "Importing..."
                                : (isStore ? "Replace Store Data" : "Replace Marketing Data")}
                        </Button>
                    </div>
                </Card>
            </div>
            
            {/* Confirmation Dialog */}
            <Dialog open={showConfirm} onOpenChange={(open) => !open && cancelImport()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className={`flex items-center ${importMode === "replace" ? "text-destructive" : "text-primary"}`}>
                            {importMode === "replace" ? <AlertTriangle className="mr-2 h-5 w-5" /> : <ShieldCheck className="mr-2 h-5 w-5" />}
                            {importMode === "replace"
                                ? (isStore ? "DANGER: REPLACE STORE DATA" : "DANGER: REPLACE MARKETING DATA")
                                : (isStore ? "SAFE STORE DATA MERGE" : "SAFE MARKETING DATA MERGE")}
                        </DialogTitle>
                        <DialogDescription className="pt-4 text-base space-y-4">
                            <p>
                                You are about to {importMode === "replace" ? "replace" : "merge"} {isStore ? "Store Purchase" : "Marketing"} data with the file: <br/>
                                <strong className="text-foreground">{fileToImport?.name}</strong>
                            </p>
                            <p>
                                {importMode === "replace" 
                                    ? <span className="text-destructive font-bold">
                                        WARNING: This will permanently DELETE all existing {isStore ? "Store Purchase" : "Marketing"} data and replace it entirely with the backup file. {isStore ? "Marketing & Sales data will remain untouched." : "Store Purchase data will remain untouched."}
                                      </span>
                                    : `This backup will be safely merged with your existing ${isStore ? "Store" : "Marketing"} data. Existing records will not be deleted. Duplicate records will be skipped and new records will be added.`}
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
                                    {importMode === "replace"
                                        ? `I understand that ALL CURRENT ${isStore ? "STORE" : "MARKETING"} DATA WILL BE DELETED.`
                                        : "I understand that my existing data will be kept safe and not deleted."}
                                </label>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={cancelImport}>Cancel</Button>
                        <Button 
                            variant={importMode === "replace" ? "destructive" : "default"}
                            disabled={!understood || isImporting} 
                            onClick={handleConfirmImport}
                        >
                            {isImporting
                                ? (importMode === "replace" ? "Importing..." : "Merging...")
                                : (importMode === "replace" ? (isStore ? "Replace Store Data" : "Replace Marketing Data") : "Merge & Restore")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
