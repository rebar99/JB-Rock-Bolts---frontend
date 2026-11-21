import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Search,
    UserPlus,
    Users,
    Filter,
    Edit,
    Eye,
    Power,
    UploadCloud,
    Download,
    FileText,
    CheckCircle2,
    XCircle,
    UserCheck,
    UserX,
    Building2,
    MapPin,
    Briefcase,
    Calendar,
    Phone,
    CreditCard,
    GraduationCap,
    Clock,
    FileCheck,
    AlertCircle,
    X,
    Trash2,
    Mail,
    Plus,
    Camera,
    User,
    ChevronDown,
    ArrowUpDown,
    ArrowUpAZ,
    ArrowDownAZ,
    FilterX,
} from "lucide-react";
import {
    fetchHREmployees,
    fetchHREmployee,
    createHREmployee,
    updateHREmployee,
    toggleHREmployeeStatus,
    deleteHREmployee,
    uploadHREmployeeDoc,
    fetchHRDesignations,
    fetchHRLocations,
    fetchNextHREmployeeCode,
    resolveFileUrl,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ColumnFilterDropdown from "@/components/ui/ColumnFilterDropdown";

// ─── Excel-style Column Filter Display Value Helper ────────────────────────
const getColDisplayValue = (emp, key) => {
    switch (key) {
        case "code": return emp.employee_code || "";
        case "name": return emp.name || "";
        case "designation": return emp.designation || "";
        case "location": return emp.location || "";
        case "mobile": return emp.mobile ? `+91 ${emp.mobile}` : "";
        case "joining": return emp.date_of_joining ? new Date(emp.date_of_joining).toLocaleDateString("en-IN") : "";
        case "experience": return emp.experience || "";
        case "salary": return emp.present_salary !== undefined && emp.present_salary !== null ? `₹${Number(emp.present_salary).toLocaleString("en-IN")}` : "₹0";
        case "status": return emp.is_active ? "Active" : "Inactive";
        default: return "";
    }
};

// Calculate age from DOB
const calculateAge = (dobString) => {
    if (!dobString) return "";
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return "";
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
    }
    return age >= 0 ? `${age} Years` : "";
};

// Calculate experience from Date of Joining
const calculateExperience = (dojString) => {
    if (!dojString) return "";
    const doj = new Date(dojString);
    if (isNaN(doj.getTime())) return "";
    const today = new Date();
    let months = (today.getFullYear() - doj.getFullYear()) * 12 + (today.getMonth() - doj.getMonth());
    if (today.getDate() < doj.getDate()) {
        months--;
    }
    if (months < 0) return "Just joined";
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (years > 0 && remainingMonths > 0) return `${years} Year${years > 1 ? "s" : ""} ${remainingMonths} Month${remainingMonths > 1 ? "s" : ""}`;
    if (years > 0) return `${years} Year${years > 1 ? "s" : ""}`;
    return `${remainingMonths} Month${remainingMonths > 1 ? "s" : ""}`;
};

export default function HREmployees() {
    const queryClient = useQueryClient();

    // Resizable columns
    const HR_EMP_COL_DEFAULTS = {
        sno: 60,
        code: 110,
        name: 240,
        designation: 150,
        location: 150,
        mobile: 130,
        joining: 120,
        experience: 110,
        salary: 130,
        status: 120,
        actions: 130,
    };
    const { widths: colWidths, startResize } = useResizableColumns("colw:hr-employees-v2", HR_EMP_COL_DEFAULTS);

    // Filters and Search state
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedDesignation, setSelectedDesignation] = useState("all");
    const [selectedLocation, setSelectedLocation] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all"); // "all", "active", "inactive"

    // Column sort & filter state
    const [sortKey, setSortKey] = useState(null);
    const [sortDir, setSortDir] = useState("asc");
    const [colFilters, setColFilters] = useState({});

    const handleColSort = useCallback((key, dir) => {
        setSortKey(key);
        setSortDir(dir);
    }, []);

    // Dialog state
    const [formModalOpen, setFormModalOpen] = useState(false);
    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [viewingEmployee, setViewingEmployee] = useState(null);

    // Form fields state (21 required fields)
    const [formData, setFormData] = useState({
        employee_code: "",
        name: "",
        designation: "",
        father_name: "",
        date_of_birth: "",
        mobile: "",
        address: "",
        date_of_joining: "",
        starting_salary: "",
        present_salary: "",
        location: "",
        qualification: "",
        aadhaar_number: "",
        pan_number: "",
        bank_account_holder: "",
        bank_name: "",
        bank_account_number: "",
        bank_ifsc: "",
        bank_branch: "",
    });

    // File state for document uploads
    const [profileImageFile, setProfileImageFile] = useState(null);
    const profileInputRef = useRef(null);
    const [aadhaarDocFile, setAadhaarDocFile] = useState(null);
    const [panDocFile, setPanDocFile] = useState(null);
    const [bankDocFile, setBankDocFile] = useState(null);
    const [qualificationDocFile, setQualificationDocFile] = useState(null);
    const [customQualInput, setCustomQualInput] = useState("");
    const [fileErrors, setFileErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    // Profile preview URL (either new file blob or existing saved URL)
    const profilePreviewUrl = useMemo(() => {
        if (profileImageFile) {
            try {
                return URL.createObjectURL(profileImageFile);
            } catch {
                return null;
            }
        }
        if (editingEmployee?.profile_image_url) {
            return resolveFileUrl(editingEmployee.profile_image_url);
        }
        return null;
    }, [profileImageFile, editingEmployee]);

    // Dynamic qualifications list derived from comma-separated formData.qualification
    const qualificationsList = useMemo(() => {
        if (!formData.qualification) return [];
        return formData.qualification
            .split(",")
            .map((q) => q.trim())
            .filter(Boolean);
    }, [formData.qualification]);

    const handleAddQualification = (newQual) => {
        const val = (newQual || customQualInput).trim();
        if (!val) return;
        const current = formData.qualification
            ? formData.qualification.split(",").map((q) => q.trim()).filter(Boolean)
            : [];
        if (!current.some((c) => c.toLowerCase() === val.toLowerCase())) {
            const updated = [...current, val].join(", ");
            setFormData((prev) => ({ ...prev, qualification: updated }));
        }
        setCustomQualInput("");
    };

    const handleRemoveQualification = (qualToRemove) => {
        const current = formData.qualification
            ? formData.qualification.split(",").map((q) => q.trim()).filter(Boolean)
            : [];
        const updated = current.filter((q) => q.toLowerCase() !== qualToRemove.toLowerCase()).join(", ");
        setFormData((prev) => ({ ...prev, qualification: updated }));
    };

    const MAX_FILE_SIZE = 50 * 1024; // 50 KB
    const handleFileChange = (fieldName, setter, inputRef) => (e) => {
        const file = e.target.files[0];
        if (file && file.size > MAX_FILE_SIZE) {
            setFileErrors(prev => ({ ...prev, [fieldName]: "File size must not exceed 50 KB. Please choose a smaller file." }));
            e.target.value = "";
            setter(null);
            return;
        }
        setFileErrors(prev => ({ ...prev, [fieldName]: null }));
        setter(file || null);
    };
    const [deleteConfirmEmployee, setDeleteConfirmEmployee] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [deactivateModalEmployee, setDeactivateModalEmployee] = useState(null);
    const [deactivateDate, setDeactivateDate] = useState(new Date().toISOString().split("T")[0]);
    const [deactivating, setDeactivating] = useState(false);

    // Query list of employees - Safe Array Guard
    const { data: rawEmployees = [], isLoading, error: employeesError } = useQuery({
        queryKey: ["hr-employees", statusFilter, selectedDesignation, selectedLocation, searchTerm],
        queryFn: () =>
            fetchHREmployees({
                is_active: statusFilter === "all" ? undefined : statusFilter === "active",
                designation: selectedDesignation === "all" ? undefined : selectedDesignation,
                location: selectedLocation === "all" ? undefined : selectedLocation,
                search: searchTerm || undefined,
            }),
    });

    const employees = useMemo(() => (Array.isArray(rawEmployees) ? rawEmployees : []), [rawEmployees]);

    // Unique values per column for Excel-like column filter dropdowns
    const columnUniqueValues = useMemo(() => {
        const keys = ["code", "name", "designation", "location", "mobile", "joining", "experience", "salary", "status"];
        const map = {};
        keys.forEach(k => {
            const set = new Set();
            employees.forEach(emp => {
                const val = getColDisplayValue(emp, k);
                if (val !== undefined && val !== null && String(val).trim() !== "") {
                    set.add(String(val).trim());
                }
            });
            map[k] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        });
        return map;
    }, [employees]);

    // Process employees with column filters and sorting
    const processedEmployees = useMemo(() => {
        let list = [...employees];

        // Apply column filters
        Object.entries(colFilters).forEach(([colKey, allowedValues]) => {
            if (allowedValues && Array.isArray(allowedValues)) {
                const allowedSet = new Set(allowedValues.map(v => String(v).trim()));
                list = list.filter(emp => allowedSet.has(String(getColDisplayValue(emp, colKey)).trim()));
            }
        });

        // Apply column sorting
        if (sortKey) {
            list.sort((a, b) => {
                if (sortKey === "salary") {
                    const valA = Number(a.present_salary || 0);
                    const valB = Number(b.present_salary || 0);
                    return sortDir === "asc" ? valA - valB : valB - valA;
                } else if (sortKey === "joining") {
                    const valA = a.date_of_joining ? new Date(a.date_of_joining).getTime() : 0;
                    const valB = b.date_of_joining ? new Date(b.date_of_joining).getTime() : 0;
                    return sortDir === "asc" ? valA - valB : valB - valA;
                } else {
                    const valA = String(getColDisplayValue(a, sortKey) || "").toLowerCase();
                    const valB = String(getColDisplayValue(b, sortKey) || "").toLowerCase();
                    const cmp = valA.localeCompare(valB, undefined, { numeric: true });
                    return sortDir === "asc" ? cmp : -cmp;
                }
            });
        }

        return list;
    }, [employees, colFilters, sortKey, sortDir]);

    // Query designations & locations for filter dropdowns - Safe Array Guards
    const { data: rawDesignations = [] } = useQuery({
        queryKey: ["hr-meta-designations"],
        queryFn: fetchHRDesignations,
    });
    const designations = useMemo(() => (Array.isArray(rawDesignations) ? rawDesignations : []), [rawDesignations]);

    const { data: rawLocations = [] } = useQuery({
        queryKey: ["hr-meta-locations"],
        queryFn: fetchHRLocations,
    });
    const locations = useMemo(() => (Array.isArray(rawLocations) ? rawLocations : []), [rawLocations]);

    // Open Add Modal
    const handleOpenAdd = async () => {
        setEditingEmployee(null);
        let suggestedCode = "EMP-001";
        try {
            const res = await fetchNextHREmployeeCode();
            if (res?.next_code) suggestedCode = res.next_code;
        } catch {}
        setFormData({
            employee_code: suggestedCode,
            name: "",
            designation: "",
            father_name: "",
            date_of_birth: "",
            mobile: "",
            address: "",
            date_of_joining: new Date().toISOString().split("T")[0],
            starting_salary: "",
            present_salary: "",
            location: "",
            qualification: "",
            gender: "",
            marital_status: "",
            email: "",
            aadhaar_number: "",
            pan_number: "",
            bank_account_holder: "",
            bank_name: "",
            bank_account_number: "",
            bank_ifsc: "",
            bank_branch: "",
        });
        setProfileImageFile(null);
        setAadhaarDocFile(null);
        setPanDocFile(null);
        setBankDocFile(null);
        setQualificationDocFile(null);
        setCustomQualInput("");
        setFormModalOpen(true);
    };

    // Open Edit Modal
    const handleOpenEdit = async (emp) => {
        try {
            const fullEmp = await fetchHREmployee(emp.id);
            setEditingEmployee(fullEmp);
            setFormData({
                employee_code: fullEmp.employee_code || "",
                name: fullEmp.name || "",
                designation: fullEmp.designation || "",
                father_name: fullEmp.father_name || "",
                date_of_birth: fullEmp.date_of_birth || "",
                mobile: fullEmp.mobile || "",
                address: fullEmp.address || "",
                date_of_joining: fullEmp.date_of_joining || "",
                starting_salary: fullEmp.starting_salary || "",
                present_salary: fullEmp.present_salary || "",
                location: fullEmp.location || "",
                qualification: fullEmp.qualification || "",
                gender: fullEmp.gender || "",
                marital_status: fullEmp.marital_status || "",
                email: fullEmp.email || "",
                aadhaar_number: fullEmp.aadhaar_number || "",
                pan_number: fullEmp.pan_number || "",
                bank_account_holder: fullEmp.bank_account_holder || "",
                bank_name: fullEmp.bank_name || "",
                bank_account_number: fullEmp.bank_account_number || "",
                bank_ifsc: fullEmp.bank_ifsc || "",
                bank_branch: fullEmp.bank_branch || "",
            });
            setProfileImageFile(null);
            setAadhaarDocFile(null);
            setPanDocFile(null);
            setBankDocFile(null);
            setQualificationDocFile(null);
            setCustomQualInput("");
            setFormModalOpen(true);
        } catch (err) {
            toast.error(err.message || "Failed to load employee details for editing");
        }
    };

    // Open View Profile Modal
    const handleOpenView = async (emp) => {
        try {
            const fullEmp = await fetchHREmployee(emp.id);
            setViewingEmployee(fullEmp);
            setViewModalOpen(true);
        } catch (err) {
            toast.error(err.message || "Failed to load full profile");
        }
    };

    // Click on toggle power icon
    const handleToggleClick = (emp) => {
        if (emp.is_active) {
            setDeactivateDate(new Date().toISOString().split("T")[0]);
            setDeactivateModalEmployee(emp);
        } else {
            handleReactivate(emp);
        }
    };

    // Confirm Deactivation with Date
    const handleConfirmDeactivate = async () => {
        if (!deactivateModalEmployee) return;
        setDeactivating(true);
        try {
            await toggleHREmployeeStatus(deactivateModalEmployee.id, { inactive_date: deactivateDate });
            toast.success(`Employee ${deactivateModalEmployee.name} has been marked Inactive (${deactivateDate}).`);
            queryClient.invalidateQueries({ queryKey: ["hr-employees"] });
            queryClient.invalidateQueries({ queryKey: ["hr-dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["hr-attendance"] });
            setDeactivateModalEmployee(null);
        } catch (err) {
            toast.error(err.message || "Failed to deactivate employee");
        } finally {
            setDeactivating(false);
        }
    };

    // Reactivate an inactive employee
    const handleReactivate = async (emp) => {
        if (!window.confirm(`Are you sure you want to reactivate ${emp.name}?`)) return;
        try {
            await toggleHREmployeeStatus(emp.id);
            toast.success(`Employee ${emp.name} is now Active.`);
            queryClient.invalidateQueries({ queryKey: ["hr-employees"] });
            queryClient.invalidateQueries({ queryKey: ["hr-dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["hr-attendance"] });
        } catch (err) {
            toast.error(err.message || "Failed to activate employee");
        }
    };

    // Delete Employee Permanently
    const handleDelete = async () => {
        if (!deleteConfirmEmployee) return;
        setDeleting(true);
        try {
            await deleteHREmployee(deleteConfirmEmployee.id);
            toast.success(`Employee ${deleteConfirmEmployee.name} (${deleteConfirmEmployee.employee_code}) has been permanently deleted.`);
            queryClient.invalidateQueries({ queryKey: ["hr-employees"] });
            queryClient.invalidateQueries({ queryKey: ["hr-dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["hr-attendance"] });
            setDeleteConfirmEmployee(null);
        } catch (err) {
            toast.error(err.message || "Failed to delete employee");
        } finally {
            setDeleting(false);
        }
    };

    // Save employee form (Create or Update)
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.employee_code.trim()) {
            toast.error("Employee Code is required");
            return;
        }
        if (!formData.name.trim()) {
            toast.error("Employee Name is required");
            return;
        }
        const cleanMobile = formData.mobile.replace(/\D/g, "");
        if (cleanMobile.length !== 10) {
            toast.error("Mobile Number exactly 10 digits hona chahiye");
            return;
        }

        setSubmitting(true);
        try {
            let savedEmp;
            const payload = {
                ...formData,
                starting_salary: formData.starting_salary ? Number(formData.starting_salary) : 0,
                present_salary: formData.present_salary ? Number(formData.present_salary) : 0,
            };

            if (editingEmployee) {
                savedEmp = await updateHREmployee(editingEmployee.id, payload);
                toast.success(`Employee ${savedEmp.name} updated successfully!`);
            } else {
                savedEmp = await createHREmployee(payload);
                toast.success(`Employee ${savedEmp.name} created with Code: ${savedEmp.employee_code}!`);
            }

            const empId = savedEmp.id;
            if (profileImageFile) {
                await uploadHREmployeeDoc(empId, "profile", profileImageFile).catch(() => {});
            }
            if (aadhaarDocFile) {
                await uploadHREmployeeDoc(empId, "aadhaar", aadhaarDocFile).catch(() => {});
            }
            if (panDocFile) {
                await uploadHREmployeeDoc(empId, "pan", panDocFile).catch(() => {});
            }
            if (bankDocFile) {
                await uploadHREmployeeDoc(empId, "bank", bankDocFile).catch(() => {});
            }
            if (qualificationDocFile) {
                await uploadHREmployeeDoc(empId, "qualification", qualificationDocFile).catch(() => {});
            }

            setFormModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["hr-employees"] });
            queryClient.invalidateQueries({ queryKey: ["hr-dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["hr-meta-designations"] });
            queryClient.invalidateQueries({ queryKey: ["hr-meta-locations"] });
        } catch (err) {
            toast.error(err.message || "Failed to save employee");
        } finally {
            setSubmitting(false);
        }
    };

    const calculatedAge = useMemo(() => calculateAge(formData.date_of_birth), [formData.date_of_birth]);
    const calculatedExp = useMemo(() => calculateExperience(formData.date_of_joining), [formData.date_of_joining]);

    return (
        <div className="space-y-4">
            {/* Header: Title and Add Button - Store / Marketing style */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3.5">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Employee Details</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Manage registered staff profiles, personal info, qualifications, and banking documents.
                    </p>
                </div>
                <Button
                    onClick={handleOpenAdd}
                    className="bg-[#183260] hover:bg-[#122548] text-white shadow-sm font-semibold"
                >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add Employee
                </Button>
            </div>

            {/* Filter and Search Bar */}
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 bg-card p-3 rounded-xl border border-border shadow-xs">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search name, code, phone..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 text-xs h-9 bg-background"
                    />
                </div>

                {/* Filter Designation */}
                <div>
                    <select
                        value={selectedDesignation}
                        onChange={(e) => setSelectedDesignation(e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                        <option value="all">All Designations</option>
                        {designations.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Filter Location */}
                <div>
                    <select
                        value={selectedLocation}
                        onChange={(e) => setSelectedLocation(e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                        <option value="all">All Office Locations</option>
                        {locations.map((loc) => (
                            <option key={loc} value={loc}>
                                {loc}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Status Filter */}
                <div className="flex rounded-md border border-border bg-muted/60 p-0.5 text-xs">
                    <button
                        type="button"
                        onClick={() => setStatusFilter("all")}
                        className={cn(
                            "flex-1 rounded py-1 font-medium transition",
                            statusFilter === "all" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        All
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter("active")}
                        className={cn(
                            "flex-1 rounded py-1 font-medium transition",
                            statusFilter === "active" ? "bg-emerald-600 text-white shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Active
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter("inactive")}
                        className={cn(
                            "flex-1 rounded py-1 font-medium transition",
                            statusFilter === "inactive" ? "bg-destructive text-white shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Inactive
                    </button>
                </div>
            </div>

            {/* Employee List Table - Full width */}
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                <div className="overflow-x-auto min-h-[440px]">
                    <table className="w-full table-fixed border-collapse text-xs" style={{ minWidth: "1100px" }}>
                        <colgroup>
                            <col style={{ width: colWidths.sno }} />
                            <col style={{ width: colWidths.code }} />
                            <col style={{ width: colWidths.name }} />
                            <col style={{ width: colWidths.designation }} />
                            <col style={{ width: colWidths.location }} />
                            <col style={{ width: colWidths.mobile }} />
                            <col style={{ width: colWidths.joining }} />
                            <col style={{ width: colWidths.experience }} />
                            <col style={{ width: colWidths.salary }} />
                            <col style={{ width: colWidths.status }} />
                            <col style={{ width: colWidths.actions }} />
                        </colgroup>
                        <thead>
                            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-[11px] font-bold uppercase tracking-wider select-none border-b border-slate-300 dark:border-slate-700">
                                {[
                                    { key: "sno", label: "S.No", alignClass: "text-center pl-3" },
                                    { key: "code", label: "Emp Code", alignClass: "text-left px-3" },
                                    { key: "name", label: "Employee Name", alignClass: "text-left px-3" },
                                    { key: "designation", label: "Designation", alignClass: "text-left px-3" },
                                    { key: "location", label: "Office Location", alignClass: "text-left px-3" },
                                    { key: "mobile", label: "Mobile", alignClass: "text-center px-3" },
                                    { key: "joining", label: "Joining Date", alignClass: "text-center px-3" },
                                    { key: "experience", label: "Experience", alignClass: "text-center px-3" },
                                    { key: "salary", label: "Present Salary", alignClass: "text-right px-3 pr-4" },
                                    { key: "status", label: "Status", alignClass: "text-center px-3" },
                                    { key: "actions", label: "Actions", alignClass: "text-center px-3 pr-4" },
                                ].map(({ key, label, alignClass }) => (
                                    <th
                                        key={key}
                                        style={{ width: colWidths[key], minWidth: colWidths[key], maxWidth: colWidths[key] }}
                                        className={cn("relative py-3 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700 group/col", alignClass)}
                                    >
                                        {["sno", "actions"].includes(key) ? (
                                            <span className="truncate block">{label}</span>
                                        ) : (
                                            <ColumnFilterDropdown
                                                label={label}
                                                colKey={key}
                                                allValues={columnUniqueValues[key] || []}
                                                activeFilters={colFilters}
                                                setActiveFilters={setColFilters}
                                                sortKey={sortKey}
                                                sortDir={sortDir}
                                                onSort={handleColSort}
                                                align={alignClass.includes("text-right") ? "right" : alignClass.includes("text-center") ? "center" : "left"}
                                            />
                                        )}
                                        {/* Bright Blue vertical line handle — full height, clearly visible */}
                                        <div
                                            onMouseDown={startResize(key)}
                                            className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-20 flex items-center justify-center hover:bg-blue-500/20 group/handle"
                                            title="Drag corner to resize column"
                                        >
                                            <div className="w-[3px] h-full bg-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.6)] group-hover/handle:bg-blue-600 group-hover/handle:w-[4px] transition-all" />
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={11} className="p-8 text-center text-muted-foreground">
                                        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                        <p className="mt-2 text-xs">Loading employees...</p>
                                    </td>
                                </tr>
                            ) : processedEmployees.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="p-8 text-center text-muted-foreground">
                                        <Users className="mx-auto h-8 w-8 text-muted-foreground/40" />
                                        <p className="mt-2 text-sm font-semibold text-foreground">No employees found</p>
                                        <p className="text-xs text-muted-foreground">
                                            {Object.values(colFilters).some(Boolean) ? "Try clearing column filters." : "Click \"Add Employee\" to register the first employee."}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                processedEmployees.map((emp, idx) => (
                                    <tr key={emp.id} className="transition hover:bg-muted/30">
                                        <td
                                            style={{ width: colWidths.sno, minWidth: colWidths.sno, maxWidth: colWidths.sno }}
                                            className="py-3 pl-3 text-center text-muted-foreground font-medium truncate"
                                        >
                                            {idx + 1}
                                        </td>
                                        <td
                                            style={{ width: colWidths.code, minWidth: colWidths.code, maxWidth: colWidths.code }}
                                            className="py-3 px-3 text-left font-mono font-bold text-[#183260] dark:text-cyan-400 truncate cursor-pointer hover:text-blue-700"
                                            onClick={() => handleOpenView(emp)}
                                            title="Click to view profile"
                                        >
                                            {emp.employee_code}
                                        </td>
                                        <td
                                            style={{ width: colWidths.name, minWidth: colWidths.name, maxWidth: colWidths.name }}
                                            className="py-3 px-3 text-left overflow-hidden cursor-pointer"
                                            onClick={() => handleOpenView(emp)}
                                            title="Click to view profile"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                {emp.profile_image_url ? (
                                                    <img
                                                        src={resolveFileUrl(emp.profile_image_url)}
                                                        alt={emp.name}
                                                        className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-border"
                                                    />
                                                ) : (
                                                    <div className="shrink-0 grid h-8 w-8 place-items-center rounded-full bg-blue-100 dark:bg-blue-950 text-[11px] font-bold text-blue-800 dark:text-blue-300">
                                                        {(emp.name || "?").slice(0, 2).toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="min-w-0 truncate">
                                                    <p className="font-semibold text-foreground truncate">{emp.name}</p>
                                                    
                                                </div>
                                            </div>
                                        </td>
                                        <td
                                            style={{ width: colWidths.designation, minWidth: colWidths.designation, maxWidth: colWidths.designation }}
                                            className="py-3 px-3 text-left font-medium text-foreground truncate cursor-pointer hover:text-blue-700"
                                            onClick={() => handleOpenView(emp)}
                                            title="Click to view profile"
                                        >
                                            {emp.designation || "—"}
                                        </td>
                                        <td
                                            style={{ width: colWidths.location, minWidth: colWidths.location, maxWidth: colWidths.location }}
                                            className="py-3 px-3 text-left text-muted-foreground truncate cursor-pointer hover:text-blue-700"
                                            onClick={() => handleOpenView(emp)}
                                            title="Click to view profile"
                                        >
                                            {emp.location || "—"}
                                        </td>
                                        <td
                                            style={{ width: colWidths.mobile, minWidth: colWidths.mobile, maxWidth: colWidths.mobile }}
                                            className="py-3 px-3 text-center text-muted-foreground font-mono truncate cursor-pointer hover:text-blue-700"
                                            onClick={() => handleOpenView(emp)}
                                            title="Click to view profile"
                                        >
                                            {emp.mobile ? `+91 ${emp.mobile}` : "—"}
                                        </td>
                                        <td
                                            style={{ width: colWidths.joining, minWidth: colWidths.joining, maxWidth: colWidths.joining }}
                                            className="py-3 px-3 text-center text-muted-foreground truncate cursor-pointer hover:text-blue-700"
                                            onClick={() => handleOpenView(emp)}
                                            title="Click to view profile"
                                        >
                                            {emp.date_of_joining ? new Date(emp.date_of_joining).toLocaleDateString("en-IN") : "—"}
                                        </td>
                                        <td
                                            style={{ width: colWidths.experience, minWidth: colWidths.experience, maxWidth: colWidths.experience }}
                                            className="py-3 px-3 text-center text-muted-foreground truncate cursor-pointer hover:text-blue-700"
                                            onClick={() => handleOpenView(emp)}
                                            title="Click to view profile"
                                        >
                                            {emp.experience || "—"}
                                        </td>
                                        <td
                                            style={{ width: colWidths.salary, minWidth: colWidths.salary, maxWidth: colWidths.salary }}
                                            className="py-3 px-3 pr-4 text-right font-semibold text-foreground truncate cursor-pointer hover:text-blue-700"
                                            onClick={() => handleOpenView(emp)}
                                            title="Click to view profile"
                                        >
                                            ₹{Number(emp.present_salary || 0).toLocaleString("en-IN")}
                                        </td>
                                        <td
                                            style={{ width: colWidths.status, minWidth: colWidths.status, maxWidth: colWidths.status }}
                                            className="py-3 px-3 text-center"
                                        >
                                            <div className="flex flex-col items-center justify-center">
                                                <span
                                                    className={cn(
                                                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                                                        emp.is_active
                                                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                                            : "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-800"
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            "h-1.5 w-1.5 rounded-full",
                                                            emp.is_active ? "bg-emerald-500" : "bg-red-500"
                                                        )}
                                                    />
                                                    {emp.is_active ? "Active" : "Inactive"}
                                                </span>
                                                {!emp.is_active && emp.inactive_date && (
                                                    <span className="text-[9px] text-red-600 dark:text-red-400 font-semibold mt-0.5 whitespace-nowrap">
                                                        {new Date(emp.inactive_date).toLocaleDateString("en-IN")}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td
                                            style={{ width: colWidths.actions, minWidth: colWidths.actions, maxWidth: colWidths.actions }}
                                            className="py-3 px-3 pr-4 text-center"
                                        >
                                            <div className="flex items-center justify-center gap-1">
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => handleOpenView(emp)}
                                                    className="h-7 w-7 text-muted-foreground hover:text-blue-600 hover:bg-blue-50"
                                                    title="View Profile"
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => handleOpenEdit(emp)}
                                                    className="h-7 w-7 text-muted-foreground hover:text-[#183260] hover:bg-blue-50"
                                                    title="Edit Details"
                                                >
                                                    <Edit className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => handleToggleClick(emp)}
                                                    className={cn(
                                                        "h-7 w-7",
                                                        emp.is_active
                                                            ? "text-muted-foreground hover:text-amber-600 hover:bg-amber-50"
                                                            : "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50"
                                                    )}
                                                    title={emp.is_active ? "Deactivate Employee" : "Activate Employee"}
                                                >
                                                    <Power className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => setDeleteConfirmEmployee(emp)}
                                                    className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                                                    title="Delete Employee"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5 text-red-500 hover:text-red-700" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="border-t border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground flex justify-between items-center">
                    <span>Showing {employees.length} employees</span>
                    <span className="text-[11px] text-muted-foreground/70">Aadhaar and Bank details masked for privacy</span>
                </div>
            </div>

            {/* ADD / EDIT EMPLOYEE MODAL (21 Complete Fields) */}
            <Dialog open={formModalOpen} onOpenChange={setFormModalOpen}>
                <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-foreground">
                            {editingEmployee ? `Edit Employee (${editingEmployee.employee_code})` : "Add New Employee"}
                        </DialogTitle>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4 py-2">
                        {/* Top: Circular Profile Picture Upload */}
                        <div className="flex flex-col items-center justify-center py-2 bg-muted/10 rounded-xl border border-dashed border-border/70 p-3">
                            <div
                                onClick={() => profileInputRef.current?.click()}
                                className="relative group cursor-pointer"
                                title="Click to upload profile photo"
                            >
                                <div className="w-24 h-24 rounded-full ring-2 ring-primary/40 group-hover:ring-primary ring-offset-2 overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center transition-all shadow-md">
                                    {profilePreviewUrl ? (
                                        <img
                                            src={profilePreviewUrl}
                                            alt="Profile"
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center text-muted-foreground/60 group-hover:text-primary transition-colors">
                                            <User className="h-12 w-12 stroke-[1.25]" />
                                        </div>
                                    )}
                                </div>

                                {/* Camera badge overlay at bottom corner */}
                                <div className="absolute bottom-0 right-0 p-1.5 rounded-full bg-[#183260] text-white shadow-md group-hover:bg-primary transition-colors ring-2 ring-background">
                                    <Camera className="h-4 w-4" />
                                </div>
                            </div>

                            <input
                                ref={profileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange("profileImage", setProfileImageFile)}
                                className="hidden"
                            />

                            <div className="flex items-center gap-2 mt-2.5">
                                <button
                                    type="button"
                                    onClick={() => profileInputRef.current?.click()}
                                    className="text-xs text-[#183260] dark:text-cyan-400 hover:underline font-semibold flex items-center gap-1"
                                >
                                    <Camera className="h-3 w-3" />
                                    <span>{profilePreviewUrl ? "Change Photo" : "Upload Photo"}</span>
                                </button>
                                {profileImageFile && (
                                    <>
                                        <span className="text-muted-foreground text-xs">•</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setProfileImageFile(null);
                                                if (profileInputRef.current) profileInputRef.current.value = "";
                                            }}
                                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                                        >
                                            Remove
                                        </button>
                                    </>
                                )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">JPEG / PNG format • Max file size: 50 KB</p>
                            {fileErrors.profileImage && (
                                <p className="text-xs text-red-600 mt-1 font-medium">{fileErrors.profileImage}</p>
                            )}
                        </div>

                        {/* Section 1: Basic Information */}
                        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-[#183260] dark:text-cyan-400 flex items-center gap-1.5">
                                <Briefcase className="h-4 w-4" /> 1. Basic & Personal Details
                            </h3>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div>
                                    <Label className="text-xs">Employee Code *</Label>
                                    <Input
                                        required
                                        placeholder="e.g. EMP-001"
                                        value={formData.employee_code}
                                        onChange={(e) => setFormData({ ...formData, employee_code: e.target.value.toUpperCase() })}
                                        className="h-8 text-xs bg-background font-mono font-bold text-[#183260] uppercase"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <Label className="text-xs">Employee Name *</Label>
                                    <Input
                                        required
                                        placeholder="Full name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="h-8 text-xs bg-background"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Father's Name</Label>
                                    <Input
                                        placeholder="Father's full name"
                                        value={formData.father_name}
                                        onChange={(e) => setFormData({ ...formData, father_name: e.target.value })}
                                        className="h-8 text-xs bg-background"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Designation *</Label>
                                    <Input
                                        required
                                        placeholder="e.g. Store Manager, Welder"
                                        value={formData.designation}
                                        onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                                        className="h-8 text-xs bg-background"
                                    />
                                </div>
                                 <div>
                                    <Label className="text-xs">Mobile Number *</Label>
                                    <div className="flex rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-primary overflow-hidden h-8">
                                        <span className="inline-flex items-center px-2.5 bg-muted/50 text-xs font-semibold text-muted-foreground border-r border-input select-none font-mono shrink-0 whitespace-nowrap">
                                            +91
                                        </span>
                                        <input
                                            required
                                            type="tel"
                                            maxLength={10}
                                            placeholder="10-digit mobile number"
                                            value={formData.mobile}
                                            onChange={(e) => {
                                                const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                                                setFormData({ ...formData, mobile: digits });
                                            }}
                                            className="h-full w-full bg-transparent px-2.5 text-xs font-mono outline-none text-foreground placeholder:text-muted-foreground"
                                        />
                                    </div>
                                    {formData.mobile && formData.mobile.length < 10 && (
                                        <p className="text-[10px] text-orange-500 mt-0.5">{formData.mobile.length}/10 digits</p>
                                    )}
                                    {formData.mobile && formData.mobile.length === 10 && (
                                        <p className="text-[10px] text-emerald-500 mt-0.5">✓ Valid</p>
                                    )}
                                </div>
                                <div>
                                    <Label className="text-xs">Gender</Label>
                                    <select
                                        value={formData.gender}
                                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                        className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:ring-1 focus:ring-primary"
                                    >
                                        <option value="">Select Gender</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <Label className="text-xs">Date of Birth</Label>
                                    <Input
                                        type="date"
                                        value={formData.date_of_birth}
                                        onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                                        className="h-8 text-xs bg-background"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Age (Auto-calculated)</Label>
                                    <Input
                                        value={calculatedAge || "—"}
                                        disabled
                                        className="h-8 text-xs bg-muted text-foreground font-semibold"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Marital Status</Label>
                                    <select
                                        value={formData.marital_status}
                                        onChange={(e) => setFormData({ ...formData, marital_status: e.target.value })}
                                        className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:ring-1 focus:ring-primary"
                                    >
                                        <option value="">Select Marital Status</option>
                                        <option value="Single">Single</option>
                                        <option value="Married">Married</option>
                                        <option value="Divorced">Divorced</option>
                                        <option value="Widowed">Widowed</option>
                                        <option value="Separated">Separated</option>
                                    </select>
                                </div>
                                <div className="sm:col-span-2">
                                    <Label className="text-xs">Email / Gmail Address</Label>
                                    <Input
                                        type="email"
                                        placeholder="e.g. employee@gmail.com"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="h-8 text-xs bg-background"
                                    />
                                </div>
                                <div className="sm:col-span-3">
                                    <Label className="text-xs">Full Address</Label>
                                    <Textarea
                                        rows={2}
                                        placeholder="Permanent / residential address"
                                        value={formData.address}
                                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                        className="min-h-[56px] text-xs bg-background resize-y"
                                    />
                                </div>
                                <div className="sm:col-span-3 space-y-1.5 pt-1 border-t border-border/40">
                                    <Label className="text-xs font-semibold">Qualification</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Type qualification (e.g. 10th, 12th, ITI, B.Tech, M.Tech)..."
                                            value={customQualInput}
                                            onChange={(e) => setCustomQualInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    handleAddQualification();
                                                }
                                            }}
                                            className="h-8 text-xs bg-background flex-1"
                                        />
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => handleAddQualification()}
                                            className="h-8 px-3 text-xs bg-[#183260] hover:bg-[#122548] text-white font-medium"
                                        >
                                            <Plus className="h-3.5 w-3.5 mr-1" />
                                            Add
                                        </Button>
                                    </div>
                                    {qualificationsList.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                            {qualificationsList.map((qual) => (
                                                <span
                                                    key={qual}
                                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800 shadow-xs"
                                                >
                                                    <span>{qual}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveQualification(qual)}
                                                        className="text-blue-500 hover:text-red-600 ml-0.5 rounded-full p-0.5 transition-colors"
                                                        title="Remove"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="sm:col-span-3">
                                    <Label className="text-xs">Upload Qualification Document (PDF / Image)</Label>
                                    <Input
                                        type="file"
                                        accept="image/*,application/pdf"
                                        onChange={handleFileChange("qualification", setQualificationDocFile)}
                                        className="h-8 text-xs bg-background file:text-xs file:py-0"
                                    />
                                    <p className="text-[10px] text-muted-foreground mt-0.5">Max file size: 50 KB</p>
                                    {fileErrors.qualification && <p className="text-xs text-red-600 mt-1">{fileErrors.qualification}</p>}
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Joining & Salary Details */}
                        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                                <CreditCard className="h-4 w-4" /> 2. Joining & Salary Details
                            </h3>
                            <div className="grid gap-3 sm:grid-cols-6">
                                <div className="sm:col-span-2">
                                    <Label className="text-xs">Date of Joining *</Label>
                                    <Input
                                        type="date"
                                        required
                                        value={formData.date_of_joining}
                                        onChange={(e) => setFormData({ ...formData, date_of_joining: e.target.value })}
                                        className="h-8 text-xs bg-background"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <Label className="text-xs">Experience with Us</Label>
                                    <Input
                                        value={calculatedExp || "—"}
                                        disabled
                                        className="h-8 text-xs bg-muted text-foreground font-semibold"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <Label className="text-xs">Office Location</Label>
                                    <Input
                                        placeholder="e.g. Una, Himachal Pradesh"
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                        className="h-8 text-xs bg-background"
                                    />
                                </div>
                                <div className="sm:col-span-3">
                                    <Label className="text-xs">Starting Salary (₹)</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        placeholder="0.00"
                                        value={formData.starting_salary}
                                        onChange={(e) => setFormData({ ...formData, starting_salary: e.target.value })}
                                        className="h-8 text-xs bg-background"
                                    />
                                </div>
                                <div className="sm:col-span-3">
                                    <Label className="text-xs">Present Salary (₹) *</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        required
                                        placeholder="0.00"
                                        value={formData.present_salary}
                                        onChange={(e) => setFormData({ ...formData, present_salary: e.target.value })}
                                        className="h-8 text-xs bg-background font-semibold text-emerald-700 dark:text-emerald-400"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Identity & KYC Documents */}
                        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                                <FileText className="h-4 w-4" /> 3. Identity & KYC Details
                            </h3>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <Label className="text-xs">Aadhaar Card Number (12 Digits)</Label>
                                    <Input
                                        maxLength={12}
                                        placeholder="12-digit number"
                                        value={formData.aadhaar_number}
                                        onChange={(e) => setFormData({ ...formData, aadhaar_number: e.target.value })}
                                        className="h-8 text-xs bg-background font-mono"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Upload Aadhaar Document (PDF / Image)</Label>
                                    <Input
                                        type="file"
                                        accept="image/*,application/pdf"
                                        onChange={handleFileChange("aadhaar", setAadhaarDocFile)}
                                        className="h-8 text-xs bg-background file:text-xs file:py-0"
                                    />
                                     <p className="text-[10px] text-muted-foreground mt-0.5">Max file size: 50 KB</p>
                                     {fileErrors.aadhaar && <p className="text-xs text-red-600 mt-1">{fileErrors.aadhaar}</p>}
                                </div>
                                <div>
                                    <Label className="text-xs">PAN Card Number (10 Alphanumeric)</Label>
                                    <Input
                                        maxLength={10}
                                        placeholder="e.g. ABCDE1234F"
                                        value={formData.pan_number}
                                        onChange={(e) => setFormData({ ...formData, pan_number: e.target.value.toUpperCase() })}
                                        className="h-8 text-xs bg-background font-mono uppercase"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Upload PAN Document (PDF / Image)</Label>
                                    <Input
                                        type="file"
                                        accept="image/*,application/pdf"
                                        onChange={handleFileChange("pan", setPanDocFile)}
                                        className="h-8 text-xs bg-background file:text-xs file:py-0"
                                    />
                                     <p className="text-[10px] text-muted-foreground mt-0.5">Max file size: 50 KB</p>
                                     {fileErrors.pan && <p className="text-xs text-red-600 mt-1">{fileErrors.pan}</p>}
                                </div>
                            </div>
                        </div>

                        {/* Section 4: Bank Details */}
                        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                <Building2 className="h-4 w-4" /> 4. Bank Account Details (for Salary)
                            </h3>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <Label className="text-xs">Account Holder Name</Label>
                                    <Input
                                        placeholder="As registered in bank"
                                        value={formData.bank_account_holder}
                                        onChange={(e) => setFormData({ ...formData, bank_account_holder: e.target.value })}
                                        className="h-8 text-xs bg-background"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Bank Name</Label>
                                    <Input
                                        placeholder="e.g. State Bank of India"
                                        value={formData.bank_name}
                                        onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                                        className="h-8 text-xs bg-background"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Account Number</Label>
                                    <Input
                                        placeholder="Bank account number"
                                        value={formData.bank_account_number}
                                        onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value })}
                                        className="h-8 text-xs bg-background font-mono"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">IFSC Code</Label>
                                    <Input
                                        maxLength={11}
                                        placeholder="e.g. SBIN0001234"
                                        value={formData.bank_ifsc}
                                        onChange={(e) => setFormData({ ...formData, bank_ifsc: e.target.value.toUpperCase() })}
                                        className="h-8 text-xs bg-background font-mono uppercase"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <Label className="text-xs">Branch Name</Label>
                                    <Input
                                        placeholder="Branch location / area"
                                        value={formData.bank_branch}
                                        onChange={(e) => setFormData({ ...formData, bank_branch: e.target.value })}
                                        className="h-8 text-xs bg-background"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <Label className="text-xs">Upload Bank Document / Cheque / Passbook (PDF / Image)</Label>
                                    <Input
                                        type="file"
                                        accept="image/*,application/pdf"
                                        onChange={handleFileChange("bank", setBankDocFile)}
                                        className="h-8 text-xs bg-background file:text-xs file:py-0"
                                    />
                                     <p className="text-[10px] text-muted-foreground mt-0.5">Max file size: 50 KB</p>
                                     {fileErrors.bank && <p className="text-xs text-red-600 mt-1">{fileErrors.bank}</p>}
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setFormModalOpen(false)}
                                disabled={submitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={submitting}
                                className="bg-[#183260] hover:bg-[#122548] text-white font-semibold"
                            >
                                {submitting ? "Saving..." : editingEmployee ? "Update Employee" : "Save Employee"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* VIEW COMPLETE EMPLOYEE PROFILE MODAL */}
            {viewingEmployee && (
                <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
                    <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-6">
                        <DialogHeader className="sr-only">
                            <DialogTitle>{viewingEmployee.name} Profile</DialogTitle>
                        </DialogHeader>

                        {/* Top Hero Card: Profile Photo First, with Name, Code, Designation & Badges */}
                        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/40 p-5 shadow-sm">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                {/* 1. Profile Picture First (Prominent & Clear) */}
                                <div className="shrink-0 self-center sm:self-auto">
                                    {viewingEmployee.profile_image_url ? (
                                        <img
                                            src={resolveFileUrl(viewingEmployee.profile_image_url)}
                                            alt={viewingEmployee.name}
                                            className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl object-cover border-2 border-white shadow-md ring-4 ring-slate-200/80"
                                        />
                                    ) : (
                                        <div className="grid h-24 w-24 sm:h-28 sm:w-28 place-items-center rounded-2xl bg-gradient-to-br from-[#183260] to-[#122548] text-2xl sm:text-3xl font-extrabold text-white shadow-md ring-4 ring-slate-200/80">
                                            {(viewingEmployee.name || "?").slice(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                </div>

                                {/* 2. Name, Code, Designation & Quick Info */}
                                <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
                                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#183260]">
                                            {viewingEmployee.name}
                                        </h2>
                                        <span
                                            className={cn(
                                                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase",
                                                viewingEmployee.is_active
                                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                                    : "bg-red-100 text-red-800 border border-red-300"
                                            )}
                                        >
                                            <span className={cn("h-1.5 w-1.5 rounded-full", viewingEmployee.is_active ? "bg-emerald-600" : "bg-red-600")} />
                                            {viewingEmployee.is_active ? "Active" : `Inactive${viewingEmployee.inactive_date ? ` (${new Date(viewingEmployee.inactive_date).toLocaleDateString("en-IN")})` : ""}`}
                                        </span>
                                    </div>

                                    {/* Code & Designation Badges */}
                                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5">
                                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-50 px-2.5 py-1 text-xs font-bold font-mono text-cyan-900 border border-cyan-200">
                                            <span>Code:</span>
                                            <span className="text-[#183260]">{viewingEmployee.employee_code}</span>
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800 border border-slate-200">
                                            <Briefcase className="h-3.5 w-3.5 text-cyan-700" />
                                            <span>{viewingEmployee.designation || "Staff"}</span>
                                        </span>
                                    </div>

                                    {/* Contact & Location Pills */}
                                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 pt-1 text-xs text-slate-600">
                                        <span className="inline-flex items-center gap-1">
                                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                                            <span className="font-semibold text-slate-800 font-mono">
                                                {viewingEmployee.mobile ? `+91 ${viewingEmployee.mobile}` : "—"}
                                            </span>
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                            <span>{viewingEmployee.location || "—"}</span>
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                                            <span>Exp: <b>{viewingEmployee.experience || "—"}</b></span>
                                        </span>
                                        {viewingEmployee.age && (
                                            <span className="inline-flex items-center gap-1">
                                                <span>Age: <b>{viewingEmployee.age} Yrs</b></span>
                                            </span>
                                        )}
                                        {viewingEmployee.email && (
                                            <span className="inline-flex items-center gap-1">
                                                <Mail className="h-3.5 w-3.5 text-slate-400" />
                                                <span>{viewingEmployee.email}</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 pt-2 text-xs">

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-3 bg-card p-3.5 rounded-xl border border-border">
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Father's Name</p>
                                    <p className="font-medium text-foreground">{viewingEmployee.father_name || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Date of Birth</p>
                                    <p className="font-medium text-foreground">{viewingEmployee.date_of_birth || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Gender</p>
                                    <p className="font-medium text-foreground">{viewingEmployee.gender || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Marital Status</p>
                                    <p className="font-medium text-foreground">{viewingEmployee.marital_status || "—"}</p>
                                </div>
                                {viewingEmployee.email && (
                                    <div className="col-span-2">
                                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Email / Gmail</p>
                                        <p className="font-medium text-foreground">{viewingEmployee.email}</p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Date of Joining</p>
                                    <p className="font-medium text-foreground">{viewingEmployee.date_of_joining || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Qualification</p>
                                    <p className="font-medium text-foreground">{viewingEmployee.qualification || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Starting Salary</p>
                                    <p className="font-medium text-foreground">₹{Number(viewingEmployee.starting_salary || 0).toLocaleString("en-IN")}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Present Salary</p>
                                    <p className="font-bold text-emerald-700 dark:text-emerald-400">₹{Number(viewingEmployee.present_salary || 0).toLocaleString("en-IN")}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Address</p>
                                    <p className="font-medium text-foreground">{viewingEmployee.address || "—"}</p>
                                </div>
                            </div>

                            {/* Bank Details */}
                            <div className="bg-muted/20 p-3.5 rounded-xl border border-border">
                                <h4 className="text-xs font-bold text-foreground uppercase tracking-wide mb-2">Banking Information</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Account Holder</p>
                                        <p className="font-medium text-foreground">{viewingEmployee.bank_account_holder || "—"}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Bank Name</p>
                                        <p className="font-medium text-foreground">{viewingEmployee.bank_name || "—"}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Account Number</p>
                                        <p className="font-mono font-semibold text-foreground">{viewingEmployee.bank_account_number || "—"}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">IFSC Code</p>
                                        <p className="font-mono font-semibold text-foreground">{viewingEmployee.bank_ifsc || "—"}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Branch</p>
                                        <p className="font-medium text-foreground">{viewingEmployee.bank_branch || "—"}</p>
                                    </div>
                                </div>
                            </div>

                            {/* KYC Documents & Downloads */}
                            <div className="bg-muted/20 p-3.5 rounded-xl border border-border">
                                <h4 className="text-xs font-bold text-foreground uppercase tracking-wide mb-2">KYC Documents</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex items-center justify-between p-2 rounded bg-background border">
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Aadhaar Card</p>
                                            <p className="font-mono font-medium">{viewingEmployee.aadhaar_number || "—"}</p>
                                        </div>
                                        {viewingEmployee.aadhaar_doc_url && (
                                            <a
                                                href={resolveFileUrl(viewingEmployee.aadhaar_doc_url)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                                                title="Download / View Aadhaar"
                                            >
                                                <Download className="h-4 w-4" />
                                            </a>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between p-2 rounded bg-background border">
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">PAN Card</p>
                                            <p className="font-mono font-medium">{viewingEmployee.pan_number || "—"}</p>
                                        </div>
                                        {viewingEmployee.pan_doc_url && (
                                            <a
                                                href={resolveFileUrl(viewingEmployee.pan_doc_url)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                                                title="Download / View PAN"
                                            >
                                                <Download className="h-4 w-4" />
                                            </a>
                                        )}
                                    </div>

                                    {viewingEmployee.bank_doc_url && (
                                        <div className="col-span-2 flex items-center justify-between p-2 rounded bg-background border">
                                            <div>
                                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Bank Proof Document</p>
                                                <p className="text-muted-foreground">Cheque / Passbook attachment</p>
                                            </div>
                                            <a
                                                href={resolveFileUrl(viewingEmployee.bank_doc_url)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                                                title="Download / View Bank Document"
                                            >
                                                <Download className="h-4 w-4" />
                                            </a>
                                        </div>
                                    )}

                                    {viewingEmployee.qualification_doc_url && (
                                        <div className="col-span-2 flex items-center justify-between p-2 rounded bg-background border">
                                            <div>
                                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Qualification Certificate / Degree</p>
                                                <p className="text-muted-foreground">{viewingEmployee.qualification ? `${viewingEmployee.qualification} Document` : "Degree attachment"}</p>
                                            </div>
                                            <a
                                                href={resolveFileUrl(viewingEmployee.qualification_doc_url)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                                                title="Download / View Qualification Certificate"
                                            >
                                                <Download className="h-4 w-4" />
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button onClick={() => setViewModalOpen(false)}>Close</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* DELETE EMPLOYEE CONFIRMATION MODAL */}
            {deleteConfirmEmployee && (
                <Dialog open={Boolean(deleteConfirmEmployee)} onOpenChange={() => setDeleteConfirmEmployee(null)}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-base font-bold text-red-600 flex items-center gap-2">
                                <Trash2 className="h-5 w-5 text-red-600" /> Delete Employee
                            </DialogTitle>
                        </DialogHeader>

                        <div className="py-2 text-xs text-muted-foreground space-y-2.5">
                            <p>
                                Are you sure you want to permanently delete employee <b className="text-foreground">{deleteConfirmEmployee.name}</b> (Code: <b className="font-mono text-[#183260]">{deleteConfirmEmployee.employee_code}</b>)?
                            </p>
                            <div className="rounded-lg bg-red-50 dark:bg-red-950/40 p-3 text-[11px] text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800 space-y-1">
                                <p className="font-bold flex items-center gap-1.5">
                                    <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                                    Permanent Action:
                                </p>
                                <p>
                                    All records associated with this employee (profile details, attendance history, and salary records) will be permanently deleted.
                                </p>
                            </div>
                        </div>

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeleteConfirmEmployee(null)}
                                disabled={deleting}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleDelete}
                                disabled={deleting}
                                className="bg-red-600 hover:bg-red-700 font-semibold"
                            >
                                {deleting ? "Deleting..." : "Confirm Delete"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* DEACTIVATE EMPLOYEE CONFIRMATION MODAL WITH DATE */}
            {deactivateModalEmployee && (
                <Dialog open={Boolean(deactivateModalEmployee)} onOpenChange={() => setDeactivateModalEmployee(null)}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-base font-bold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                                <Power className="h-5 w-5 text-amber-600" /> Deactivate Employee
                            </DialogTitle>
                        </DialogHeader>

                        <div className="py-2 text-xs space-y-3">
                            <p className="text-muted-foreground">
                                Employee: <b className="text-foreground">{deactivateModalEmployee.name}</b> (Code: <b className="font-mono text-[#183260]">{deactivateModalEmployee.employee_code}</b>)
                            </p>

                            <div>
                                <Label className="text-xs font-semibold block mb-1">Inactive Effective Date *</Label>
                                <Input
                                    type="date"
                                    value={deactivateDate}
                                    onChange={(e) => setDeactivateDate(e.target.value)}
                                    className="h-8 text-xs bg-background"
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    Select the effective date from which this employee became inactive.
                                </p>
                            </div>

                            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 text-[11px] text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 space-y-1">
                                <p className="font-bold flex items-center gap-1.5">
                                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                    Rule / Policy:
                                </p>
                                <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                                    <li>The employee will remain visible in the current month's attendance register as <b>Inactive ({deactivateDate})</b>.</li>
                                    <li>The employee will automatically be excluded from subsequent months.</li>
                                    <li>Attendance marking will be blocked for inactive employees.</li>
                                </ul>
                            </div>
                        </div>

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeactivateModalEmployee(null)}
                                disabled={deactivating}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleConfirmDeactivate}
                                disabled={deactivating || !deactivateDate}
                                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                            >
                                {deactivating ? "Deactivating..." : "Confirm Deactivate"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
