import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Trash2, RotateCcw, Clock, AlertTriangle } from 'lucide-react';

const BASE = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const getToken = () => localStorage.getItem('auth_token');

const MODULE_LABELS = {
  sale: 'PO Sales',
  purchase_order: 'Purchase Order',
  work_order: 'Work Order',
  work_order_sale: 'WO Sale',
};

const MODULE_BADGE_COLORS = {
  sale: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  purchase_order: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  work_order: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  work_order_sale: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
};

function formatDateTime(dtStr) {
  if (!dtStr) return '-';
  const dt = new Date(dtStr.endsWith('Z') ? dtStr : dtStr + 'Z');
  return dt.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function formatRemaining(remainingHours) {
  if (remainingHours === null || remainingHours === undefined) return 'Expired';
  if (remainingHours <= 0) return 'Expiring soon';
  const h = Math.floor(remainingHours);
  const m = Math.round((remainingHours - h) * 60);
  if (h === 0) return m + 'm remaining';
  return h + 'h ' + m + 'm remaining';
}

function RemainingBadge({ hours }) {
  const urgent = hours !== null && hours !== undefined && hours < 2;
  return (
    <span className={'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ' + (urgent
        ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300')}>
      <Clock className='h-3 w-3' />
      {formatRemaining(hours)}
    </span>
  );
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'sale', label: 'PO Sales' },
  { key: 'purchase_order', label: 'Purchase Orders' },
  { key: 'work_order', label: 'Work Orders' },
  { key: 'work_order_sale', label: 'WO Sales' },
];

async function apiRequest(path, options = {}) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...options.headers,
    },
    ...options,
  });
  return res;
}

export default function RecentlyDeleted() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('all');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const path = activeTab === 'all'
        ? '/api/recently-deleted'
        : '/api/recently-deleted?module=' + activeTab;
      const res = await apiRequest(path);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setRecords(await res.json());
    } catch (e) {
      toast({ title: 'Error', description: 'Could not load deleted records: ' + e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeTab, toast]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);
  useEffect(() => {
    const interval = setInterval(fetchRecords, 60000);
    return () => clearInterval(interval);
  }, [fetchRecords]);

  const handleRestore = async (record) => {
    setActionLoading(record.id + '_' + record.record_type);
    try {
      const res = await apiRequest('/api/recently-deleted/' + record.record_type + '/' + record.id + '/restore', { method: 'POST' });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Restore failed'); }
      toast({ title: 'Record Restored', description: record.record_number + ' has been restored successfully.' });
      fetchRecords();
    } catch (e) {
      toast({ title: 'Restore Failed', description: e.message, variant: 'destructive' });
    } finally { setActionLoading(null); }
  };

  const handlePermanentDelete = async () => {
    if (!confirmDelete) return;
    const { id, record_type, record_number } = confirmDelete;
    setConfirmDelete(null);
    setActionLoading(id + '_' + record_type);
    try {
      const res = await apiRequest('/api/recently-deleted/' + record_type + '/' + id, { method: 'DELETE' });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Delete failed'); }
      toast({ title: 'Permanently Deleted', description: record_number + ' has been permanently deleted.', variant: 'destructive' });
      fetchRecords();
    } catch (e) {
      toast({ title: 'Delete Failed', description: e.message, variant: 'destructive' });
    } finally { setActionLoading(null); }
  };

  return (
    <div className='p-4 sm:p-6 max-w-7xl mx-auto space-y-6'>
      <div className='flex items-center gap-3'>
        <div className='p-2 rounded-lg bg-red-100 dark:bg-red-900/30'>
          <Trash2 className='h-6 w-6 text-red-600 dark:text-red-400' />
        </div>
        <div>
          <h1 className='text-2xl font-bold text-foreground'>Recently Deleted</h1>
          <p className='text-sm text-muted-foreground'>Deleted records are kept here for 24 hours and then permanently removed.</p>
        </div>
      </div>

      <div className='flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'>
        <AlertTriangle className='h-5 w-5 text-amber-600 mt-0.5 shrink-0' />
        <p className='text-sm text-amber-800 dark:text-amber-300'>
          Records are <strong>permanently deleted after 24 hours</strong>. Please restore them before the timer expires.
        </p>
      </div>

      <div className='flex gap-1 p-1 bg-muted rounded-lg w-fit'>
        {TABS.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={'px-4 py-2 rounded-md text-sm font-medium transition-all ' + (activeTab === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {tab.label}
            {activeTab === tab.key && records.length > 0 && (
              <span className='ml-2 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded-full'>{records.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className='rounded-xl border bg-card shadow-sm overflow-hidden'>
        {loading ? (
          <div className='flex items-center justify-center py-16 text-muted-foreground'>
            <div className='animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mr-3' />
            Loading...
          </div>
        ) : records.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground'>
            <Trash2 className='h-12 w-12 opacity-20' />
            <p className='text-lg font-medium'>No deleted records found</p>
            <p className='text-sm'>{activeTab === 'all' ? 'No records have been deleted yet.' : 'No deleted ' + MODULE_LABELS[activeTab] + ' records found.'}</p>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b bg-muted/50'>
                  {['#','Record Number','Client','Module','Deleted By','Deleted At','Expires At','Remaining','Actions'].map(h => (
                    <th key={h} className={'px-4 py-3 text-left font-semibold text-muted-foreground' + (h==='Actions' ? ' text-center' : '')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((rec, idx) => {
                  const isActioning = actionLoading === rec.id + '_' + rec.record_type;
                  return (
                    <tr key={rec.record_type + '-' + rec.id} className='border-b last:border-0 hover:bg-muted/30 transition-colors'>
                      <td className='px-4 py-3 text-muted-foreground'>{idx + 1}</td>
                      <td className='px-4 py-3 font-semibold text-foreground'>{rec.record_number || '-'}</td>
                      <td className='px-4 py-3 text-foreground max-w-[160px] truncate'>{rec.client_name}</td>
                      <td className='px-4 py-3'>
                        <span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + (MODULE_BADGE_COLORS[rec.record_type] || '')}>
                          {MODULE_LABELS[rec.record_type] || rec.record_type}
                        </span>
                      </td>
                      <td className='px-4 py-3 text-muted-foreground'>{rec.deleted_by || '-'}</td>
                      <td className='px-4 py-3 text-muted-foreground whitespace-nowrap'>{formatDateTime(rec.deleted_at)}</td>
                      <td className='px-4 py-3 text-muted-foreground whitespace-nowrap'>{formatDateTime(rec.permanent_delete_at)}</td>
                      <td className='px-4 py-3'><RemainingBadge hours={rec.remaining_hours} /></td>
                      <td className='px-4 py-3'>
                        <div className='flex items-center justify-center gap-2'>
                          <Button size='sm' variant='outline'
                            className='h-8 gap-1.5 text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-950'
                            disabled={isActioning || rec.remaining_hours <= 0}
                            onClick={() => handleRestore(rec)}
                          >
                            {isActioning ? <div className='h-3.5 w-3.5 animate-spin rounded-full border-2 border-green-600 border-t-transparent' /> : <RotateCcw className='h-3.5 w-3.5' />}
                            Restore
                          </Button>
                          <Button size='sm' variant='outline'
                            className='h-8 gap-1.5 text-red-700 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-950'
                            disabled={isActioning}
                            onClick={() => setConfirmDelete({ id: rec.id, record_type: rec.record_type, record_number: rec.record_number })}
                          >
                            <Trash2 className='h-3.5 w-3.5' /> Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2 text-red-600'>
              <AlertTriangle className='h-5 w-5' /> Permanently Delete?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete <strong>{confirmDelete?.record_number}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='gap-2'>
            <Button variant='outline' onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button className='bg-red-600 hover:bg-red-700 text-white' onClick={handlePermanentDelete}>
              Yes, Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
