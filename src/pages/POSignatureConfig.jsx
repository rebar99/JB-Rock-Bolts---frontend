import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
    fetchPOSignatureConfig,
    addPOPreparedBy,
    removePOPreparedBy,
    uploadPOPreparedBySignature,
    updatePOSlabCheckedBy,
    updatePOSlabApprovedBy,
    uploadPOSlabSignature,
    resolveFileUrl,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    ArrowLeft, Upload, CheckCircle2, AlertCircle, RefreshCw,
    ImageIcon, IndianRupee, Plus, Trash2, User,
} from "lucide-react";

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => n == null ? "" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function slabLabel(level) {
    if (level.min_amount === 0 && level.max_amount != null) return `Below ₹${fmt(level.max_amount)}`;
    if (level.min_amount > 0 && level.max_amount != null) return `₹${fmt(level.min_amount)} – ₹${fmt(level.max_amount)}`;
    if (level.min_amount > 0 && level.max_amount == null) return `Above ₹${fmt(level.min_amount)}`;
    return level.level_name || `Level ${level.level_id}`;
}

function SigPreview({ url, label }) {
    const resolved = url ? resolveFileUrl(url) : null;
    return (
        <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 min-w-[100px] min-h-[64px]">
            {resolved
                ? <img src={resolved} alt={label} className="max-h-12 max-w-[100px] object-contain" />
                : <ImageIcon className="h-5 w-5 text-slate-300" />}
            <span className="text-[10px] text-slate-400">{label || "No sig"}</span>
        </div>
    );
}

function UploadBtn({ onFile, loading, label = "Upload Signature", small = false }) {
    const ref = useRef();
    return (
        <>
            <input type="file" accept="image/*" ref={ref} className="hidden"
                onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
            <Button size={small ? "sm" : "sm"} variant="outline" disabled={loading}
                onClick={() => ref.current.click()}
                className="gap-1.5 text-xs">
                {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {label}
            </Button>
        </>
    );
}

function Toast({ msg, type }) {
    if (!msg) return null;
    const bg = type === "error" ? "bg-red-50 border-red-200 text-red-700" : "bg-emerald-50 border-emerald-200 text-emerald-700";
    const Icon = type === "error" ? AlertCircle : CheckCircle2;
    return (
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-sm ${bg}`}>
            <Icon className="h-4 w-4 shrink-0" />{msg}
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function POSignatureConfig() {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);

    // Prepared By add-new state
    const [newPbUserId, setNewPbUserId] = useState("");
    const [addingPb, setAddingPb] = useState(false);

    // Per entry upload loading { [entryId]: bool }
    const [pbUploading, setPbUploading] = useState({});
    const [pbRemoving, setPbRemoving] = useState({});

    // Slab state keyed by level_id
    const [slabState, setSlabState] = useState({});

    const showToast = (msg, type = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const load = async () => {
        setLoading(true);
        try {
            const d = await fetchPOSignatureConfig();
            setData(d);
            const init = {};
            (d.levels || []).forEach((lv) => {
                init[lv.level_id] = {
                    cbUserId: lv.checked_by_user_id ? String(lv.checked_by_user_id) : "",
                    abUserId: lv.approved_by_user_id ? String(lv.approved_by_user_id) : "",
                    cbUploading: false, abUploading: false, saving: false,
                };
            });
            setSlabState(init);
        } catch (e) { showToast(e.message || "Failed to load config", "error"); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    // ── Prepared By handlers ──────────────────────────────────────────────────
    const handleAddPreparedBy = async () => {
        if (!newPbUserId) return showToast("Please select a user", "error");
        setAddingPb(true);
        try {
            const count = (data?.prepared_by_list || []).length;
            const entry = await addPOPreparedBy({ user_id: Number(newPbUserId), display_order: count });
            setData((d) => ({ ...d, prepared_by_list: [...(d.prepared_by_list || []), entry] }));
            setNewPbUserId("");
            showToast("Prepared By person added");
        } catch (e) { showToast(e.message, "error"); }
        finally { setAddingPb(false); }
    };

    const handleRemovePreparedBy = async (entryId) => {
        setPbRemoving((s) => ({ ...s, [entryId]: true }));
        try {
            await removePOPreparedBy(entryId);
            setData((d) => ({ ...d, prepared_by_list: d.prepared_by_list.filter((e) => e.id !== entryId) }));
            showToast("Removed");
        } catch (e) { showToast(e.message, "error"); }
        finally { setPbRemoving((s) => ({ ...s, [entryId]: false })); }
    };

    const handleUploadPbSig = async (entryId, file) => {
        setPbUploading((s) => ({ ...s, [entryId]: true }));
        try {
            const res = await uploadPOPreparedBySignature(entryId, file);
            setData((d) => ({
                ...d,
                prepared_by_list: d.prepared_by_list.map((e) =>
                    e.id === entryId ? { ...e, signature_url: res.signature_url } : e
                ),
            }));
            showToast("Signature uploaded");
        } catch (e) { showToast(e.message, "error"); }
        finally { setPbUploading((s) => ({ ...s, [entryId]: false })); }
    };

    // ── Slab handlers ─────────────────────────────────────────────────────────
    const setSlabField = (levelId, key, val) =>
        setSlabState((s) => ({ ...s, [levelId]: { ...s[levelId], [key]: val } }));

    const saveSlabUser = async (levelId, role) => {
        const st = slabState[levelId] || {};
        const userId = role === "checked_by" ? st.cbUserId : st.abUserId;
        if (!userId) return showToast("Please select a user first", "error");
        setSlabField(levelId, "saving", true);
        try {
            const fn = role === "checked_by" ? updatePOSlabCheckedBy : updatePOSlabApprovedBy;
            const updated = await fn(levelId, { user_id: Number(userId) });
            setData((d) => ({ ...d, levels: d.levels.map((lv) => lv.level_id === levelId ? { ...lv, ...updated } : lv) }));
            showToast(`${role === "checked_by" ? "Checked By" : "Approved By"} saved`);
        } catch (e) { showToast(e.message, "error"); }
        finally { setSlabField(levelId, "saving", false); }
    };

    const uploadSlabSig = async (levelId, sigType, file) => {
        const uploadKey = sigType === "checked_by" ? "cbUploading" : "abUploading";
        setSlabField(levelId, uploadKey, true);
        try {
            const res = await uploadPOSlabSignature(levelId, sigType, file);
            const urlKey = sigType === "checked_by" ? "checked_by_signature_url" : "approved_by_signature_url";
            setData((d) => ({
                ...d,
                levels: d.levels.map((lv) => lv.level_id === levelId ? { ...lv, [urlKey]: res.signature_url } : lv),
            }));
            showToast(`${sigType === "checked_by" ? "Checked By" : "Approved By"} signature uploaded`);
        } catch (e) { showToast(e.message, "error"); }
        finally { setSlabField(levelId, uploadKey, false); }
    };

    // ─── Render ───────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="flex h-screen items-center justify-center bg-slate-50">
            <RefreshCw className="h-7 w-7 animate-spin text-slate-400" />
        </div>
    );

    const users = data?.users || [];
    const preparedByList = data?.prepared_by_list || [];
    const levels = data?.levels || [];

    // Users not yet added as Prepared By
    const addedUserIds = new Set(preparedByList.map((e) => e.user_id));
    const availableUsers = users.filter((u) => !addedUserIds.has(u.id));

    return (
        <div className="min-h-screen bg-slate-50 font-[Inter,sans-serif]">
            {/* Header */}
            <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
                <button onClick={() => navigate(-1)}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
                    <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <div>
                    <h1 className="text-lg font-bold text-slate-900">PO Signature &amp; Approval Configuration</h1>
                    <p className="text-xs text-slate-500">Configure who signs each Store Purchase Order</p>
                </div>
                <div className="ml-auto">{toast && <Toast msg={toast.msg} type={toast.type} />}</div>
            </header>

            <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">

                {/* ── Section 1: Prepared By (multiple) ── */}
                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-6 py-4">
                        <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">1</span>
                            <div>
                                <h2 className="font-semibold text-slate-900">Prepared By</h2>
                                <p className="text-xs text-slate-500">Add one or more persons — all their signatures will appear on every Store PO</p>
                            </div>
                        </div>
                    </div>
                    <div className="px-6 py-5 space-y-4">

                        {/* Existing prepared-by entries */}
                        {preparedByList.length === 0 && (
                            <p className="text-sm text-slate-400 italic">No Prepared By persons added yet.</p>
                        )}
                        <div className="space-y-3">
                            {preparedByList.map((entry, idx) => (
                                <div key={entry.id}
                                    className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    {/* Order badge + name */}
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                                        {idx + 1}
                                    </span>
                                    <div className="flex-1 min-w-[120px]">
                                        <p className="font-semibold text-slate-800 text-sm">{entry.user_name}</p>
                                        <p className="text-xs text-slate-400">ID: {entry.user_id}</p>
                                    </div>

                                    {/* Signature preview */}
                                    <SigPreview url={entry.signature_url} label={entry.user_name} />

                                    {/* Upload + Remove */}
                                    <div className="flex flex-col gap-2">
                                        <UploadBtn
                                            onFile={(f) => handleUploadPbSig(entry.id, f)}
                                            loading={!!pbUploading[entry.id]}
                                            label="Upload Signature"
                                        />
                                        <Button size="sm" variant="ghost"
                                            disabled={!!pbRemoving[entry.id]}
                                            onClick={() => handleRemovePreparedBy(entry.id)}
                                            className="gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50">
                                            {pbRemoving[entry.id]
                                                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                                : <Trash2 className="h-3.5 w-3.5" />}
                                            Remove
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Add new person */}
                        {availableUsers.length > 0 && (
                            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-4">
                                <Plus className="h-4 w-4 text-blue-400 shrink-0" />
                                <div className="flex-1 min-w-[180px]">
                                    <Select value={newPbUserId} onValueChange={setNewPbUserId}>
                                        <SelectTrigger className="bg-white">
                                            <SelectValue placeholder="— Select person to add —" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableUsers.map((u) => (
                                                <SelectItem key={u.id} value={String(u.id)}>
                                                    {u.name}
                                                    <span className="ml-1.5 text-slate-400 text-xs">{u.email}</span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button onClick={handleAddPreparedBy} disabled={addingPb || !newPbUserId}
                                    className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm">
                                    {addingPb ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                    Add Person
                                </Button>
                            </div>
                        )}
                        {availableUsers.length === 0 && preparedByList.length > 0 && (
                            <p className="text-xs text-slate-400">All users added. Remove a person to free up the slot.</p>
                        )}
                    </div>
                </section>

                {/* ── Section 2: Amount-Slab Checked By & Approved By ── */}
                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-6 py-4">
                        <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">2</span>
                            <div>
                                <h2 className="font-semibold text-slate-900">Amount-wise Checked By &amp; Approved By</h2>
                                <p className="text-xs text-slate-500">Slab is auto-selected from PO Approval Settings based on PO grand total.</p>
                            </div>
                        </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {levels.length === 0 && (
                            <div className="px-6 py-8 text-center text-sm text-slate-400">
                                No approval levels found. Add slabs in <strong>PO Approval Settings</strong> first.
                            </div>
                        )}
                        {levels.map((lv) => {
                            const st = slabState[lv.level_id] || {};
                            return (
                                <div key={lv.level_id} className="px-6 py-5">
                                    <div className="mb-4 flex items-center gap-2">
                                        <IndianRupee className="h-4 w-4 text-slate-400" />
                                        <span className="text-sm font-semibold text-slate-800">{slabLabel(lv)}</span>
                                        <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{lv.level_name}</span>
                                    </div>
                                    <div className="grid gap-6 sm:grid-cols-2">
                                        {/* Checked By */}
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                                            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Checked By</p>
                                            <Select value={st.cbUserId || ""} onValueChange={(v) => setSlabField(lv.level_id, "cbUserId", v)}>
                                                <SelectTrigger className="bg-white text-sm"><SelectValue placeholder="— Select —" /></SelectTrigger>
                                                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                            <div className="flex items-center gap-3">
                                                <SigPreview url={lv.checked_by_signature_url} label={lv.checked_by_user_name || "Checked By"} />
                                                <div className="flex flex-col gap-2">
                                                    <UploadBtn onFile={(f) => uploadSlabSig(lv.level_id, "checked_by", f)} loading={st.cbUploading} label="Upload Sig" />
                                                    <Button size="sm" disabled={st.saving || !st.cbUserId}
                                                        onClick={() => saveSlabUser(lv.level_id, "checked_by")}
                                                        className="gap-1 bg-slate-800 hover:bg-slate-700 text-white text-xs">
                                                        {st.saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                                        Save
                                                    </Button>
                                                </div>
                                            </div>
                                            {lv.checked_by_user_name && <p className="text-xs text-slate-500">Current: <strong>{lv.checked_by_user_name}</strong></p>}
                                        </div>
                                        {/* Approved By */}
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                                            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Approved By</p>
                                            <Select value={st.abUserId || ""} onValueChange={(v) => setSlabField(lv.level_id, "abUserId", v)}>
                                                <SelectTrigger className="bg-white text-sm"><SelectValue placeholder="— Select —" /></SelectTrigger>
                                                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                            <div className="flex items-center gap-3">
                                                <SigPreview url={lv.approved_by_signature_url} label={lv.approved_by_user_name || "Approved By"} />
                                                <div className="flex flex-col gap-2">
                                                    <UploadBtn onFile={(f) => uploadSlabSig(lv.level_id, "approved_by", f)} loading={st.abUploading} label="Upload Sig" />
                                                    <Button size="sm" disabled={st.saving || !st.abUserId}
                                                        onClick={() => saveSlabUser(lv.level_id, "approved_by")}
                                                        className="gap-1 bg-slate-800 hover:bg-slate-700 text-white text-xs">
                                                        {st.saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                                        Save
                                                    </Button>
                                                </div>
                                            </div>
                                            {lv.approved_by_user_name && <p className="text-xs text-slate-500">Current: <strong>{lv.approved_by_user_name}</strong></p>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* ── Section 3: Live Preview ── */}
                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-6 py-4">
                        <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">3</span>
                            <div>
                                <h2 className="font-semibold text-slate-900">PO Signature Block Preview</h2>
                                <p className="text-xs text-slate-500">How signatures will appear at the bottom of printed PO</p>
                            </div>
                        </div>
                    </div>
                    <div className="px-6 py-6">
                        <div className="rounded-xl border border-slate-300 bg-white p-6">
                            <p className="text-right text-xs font-bold text-slate-700 mb-6">For RE-Bar Couplers India Private Limited</p>
                            <div className="flex flex-wrap justify-around gap-6">
                                {/* Prepared By — all entries */}
                                {preparedByList.map((entry) => (
                                    <div key={entry.id} className="flex flex-col items-center gap-1 min-w-[80px]">
                                        {entry.signature_url
                                            ? <img src={resolveFileUrl(entry.signature_url)} alt={entry.user_name} className="max-h-12 object-contain" />
                                            : <div className="h-12 w-20 rounded border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center"><User className="h-4 w-4 text-slate-300" /></div>}
                                        <div className="w-full border-t border-slate-400 pt-1 text-center text-[11px] font-semibold text-slate-700">Prepared By</div>
                                        <p className="text-[10px] text-slate-500">{entry.user_name}</p>
                                    </div>
                                ))}
                                {preparedByList.length === 0 && (
                                    <div className="flex flex-col items-center gap-1 min-w-[80px]">
                                        <div className="h-12 w-20 rounded border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center"><User className="h-4 w-4 text-slate-300" /></div>
                                        <div className="w-full border-t border-slate-400 pt-1 text-center text-[11px] font-semibold text-slate-400">Prepared By</div>
                                    </div>
                                )}
                                {/* Checked By */}
                                <div className="flex flex-col items-center gap-1 min-w-[80px]">
                                    {levels[0]?.checked_by_signature_url
                                        ? <img src={resolveFileUrl(levels[0].checked_by_signature_url)} alt="Checked By" className="max-h-12 object-contain" />
                                        : <div className="h-12 w-20 rounded border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center"><User className="h-4 w-4 text-slate-300" /></div>}
                                    <div className="w-full border-t border-slate-400 pt-1 text-center text-[11px] font-semibold text-slate-700">Checked By</div>
                                    {levels[0]?.checked_by_user_name && <p className="text-[10px] text-slate-500">{levels[0].checked_by_user_name}</p>}
                                </div>
                                {/* Approved By */}
                                <div className="flex flex-col items-center gap-1 min-w-[80px]">
                                    {levels[0]?.approved_by_signature_url
                                        ? <img src={resolveFileUrl(levels[0].approved_by_signature_url)} alt="Approved By" className="max-h-12 object-contain" />
                                        : <div className="h-12 w-20 rounded border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center"><User className="h-4 w-4 text-slate-300" /></div>}
                                    <div className="w-full border-t border-slate-400 pt-1 text-center text-[11px] font-semibold text-slate-700">Approved By</div>
                                    {levels[0]?.approved_by_user_name && <p className="text-[10px] text-slate-500">{levels[0].approved_by_user_name}</p>}
                                </div>
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-slate-400">
                            * Checked By &amp; Approved By signatures appear only after the respective approver approves the PO.
                        </p>
                    </div>
                </section>
            </main>
        </div>
    );
}
