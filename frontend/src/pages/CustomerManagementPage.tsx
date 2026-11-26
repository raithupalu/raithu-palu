import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  listCustomersApi,
  getCustomerDetailApi,
  createCustomerAdminApi,
  updateCustomerAdminApi,
  updateCustomerStatusApi,
  updateMilkServiceStatusApi,
  updateProductOrderServiceStatusApi,
  updateWeeklyScheduleApi,
  createNoteApi,
  bulkImportApi,
  getTimelineApi,
} from '../lib/customerApi';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export function CustomerManagementPage() {
  const { accessToken } = useAuth();
  const [customers, setCustomers] = useState<unknown[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [milkServiceStatus, setMilkServiceStatus] = useState('');
  const [productOrderServiceStatus, setProductOrderServiceStatus] = useState('');
  const [pincode, setPincode] = useState('');
  const [selected, setSelected] = useState<Record<string,unknown>|null>(null);
  const [timeline, setTimeline] = useState<unknown[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  // Bulk import
  const [bulkFile, setBulkFile] = useState<File|null>(null);
  const [bulkPreview, setBulkPreview] = useState<unknown|null>(null);
  const [bulkErrors, setBulkErrors] = useState<unknown[]>([]);
  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ fullName:'', mobileNumber:'', password:'', pincode:'', line1:'' });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listCustomersApi(accessToken, {
        search: search || undefined,
        status: status || undefined,
        milkServiceStatus: milkServiceStatus || undefined,
        productOrderServiceStatus: productOrderServiceStatus || undefined,
        pincode: pincode || undefined,
        page: String(page),
        limit: '10',
      });
      setCustomers(res.customers as unknown[]);
      setTotal(res.total);
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed'); }
    finally { setLoading(false); }
  }

  useEffect(()=>{ void load(); }, [page]);

  function handleSearch(){ setPage(1); void load(); }

  async function handleSelect(id:string){
    try {
      const c = await getCustomerDetailApi(accessToken, id);
      setSelected(c as unknown as Record<string,unknown>);
      const t = await getTimelineApi(accessToken, id);
      setTimeline(t.entries as unknown[]);
    } catch (e){ setError(e instanceof Error ? e.message : 'Detail failed'); }
  }

  async function handleCreate(){
    try {
      await createCustomerAdminApi(accessToken, {
        fullName: createForm.fullName,
        mobileNumber: createForm.mobileNumber,
        password: createForm.password,
        address: createForm.pincode ? { line1: createForm.line1, pincode: createForm.pincode } : undefined,
      });
      setShowCreate(false);
      void load();
    } catch (e){ setError(e instanceof Error ? e.message : 'Create failed'); }
  }

  async function handleBulkImport(dryRun:boolean){
    if (!bulkFile) return;
    setBulkErrors([]);
    setBulkPreview(null);
    try {
      const res = await bulkImportApi(accessToken, bulkFile, dryRun);
      if (dryRun) setBulkPreview(res.preview ?? res);
      else { setBulkPreview(res); void load(); }
    } catch (e) {
      const err = e as unknown as { message:string; errors?: unknown[]; details?: { errors?: unknown[] } };
      const errors = err.errors ?? err.details?.errors ?? [];
      if (Array.isArray(errors) && errors.length) setBulkErrors(errors as unknown[]);
      else setError(err.message);
    }
  }

  if (loading) return <LoadingState title="Loading Customers" message="Fetching customer directory..." />;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customer Management</h1>
        <button onClick={()=> setShowCreate(!showCreate)} className="rounded bg-emerald-600 px-4 py-2 text-white">Create Customer</button>
      </div>
      {error && <ErrorState title="Error" message={error} />}
      <div className="flex flex-wrap gap-2">
        <input placeholder="Search name/code/mobile" value={search} onChange={e=> setSearch(e.target.value)} className="rounded border px-3 py-2 text-sm" />
        <select value={status} onChange={e=> setStatus(e.target.value)} className="rounded border px-3 py-2 text-sm">
          <option value="">All Status</option><option value="ACTIVE">ACTIVE</option><option value="SUSPENDED">SUSPENDED</option><option value="BLOCKED">BLOCKED</option><option value="INACTIVE">INACTIVE</option>
        </select>
        <select value={milkServiceStatus} onChange={e=> setMilkServiceStatus(e.target.value)} className="rounded border px-3 py-2 text-sm">
          <option value="">Milk Service Any</option><option value="PENDING_ACTIVATION">PENDING_ACTIVATION</option><option value="ACTIVE">ACTIVE</option><option value="PAUSED">PAUSED</option><option value="STOPPED">STOPPED</option>
        </select>
        <select value={productOrderServiceStatus} onChange={e=> setProductOrderServiceStatus(e.target.value)} className="rounded border px-3 py-2 text-sm">
          <option value="">Product Service Any</option><option value="ACTIVE">ACTIVE</option><option value="PAUSED">PAUSED</option><option value="STOPPED">STOPPED</option>
        </select>
        <input placeholder="Pincode" value={pincode} onChange={e=> setPincode(e.target.value)} className="rounded border px-3 py-2 text-sm w-24" />
        <button onClick={handleSearch} className="rounded bg-slate-800 px-4 py-2 text-white text-sm">Search</button>
      </div>
      <div className="text-sm text-slate-600">Total: {total} customers</div>
      <div className="overflow-auto rounded border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50"><tr><th className="p-2 text-left">Code</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Mobile</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">MilkSvc</th><th className="p-2 text-left">ProductSvc</th></tr></thead>
          <tbody>
            {customers.map((c: unknown)=>{
              const cust = c as Record<string,string>;
              return <tr key={cust.id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={()=> handleSelect(cust.id)}><td className="p-2 font-mono">{cust.userCode}</td><td className="p-2">{cust.fullName}</td><td className="p-2">{cust.mobileNumber}</td><td className="p-2">{cust.status}</td><td className="p-2">{cust.milkServiceStatus ?? 'N/A'}</td><td className="p-2">{cust.productOrderServiceStatus ?? 'N/A'}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button disabled={page<=1} onClick={()=> setPage(p=> Math.max(1,p-1))} className="rounded border px-3 py-1">Prev</button>
        <span className="py-1 text-sm">Page {page}</span>
        <button onClick={()=> setPage(p=> p+1)} className="rounded border px-3 py-1">Next</button>
      </div>

      {showCreate && (
        <div className="rounded border bg-white p-4 space-y-3">
          <h2 className="font-semibold">Create Customer (Admin)</h2>
          <input placeholder="Full Name" value={createForm.fullName} onChange={e=> setCreateForm({...createForm, fullName:e.target.value})} className="w-full rounded border px-3 py-2 text-sm" />
          <input placeholder="Mobile" value={createForm.mobileNumber} onChange={e=> setCreateForm({...createForm, mobileNumber:e.target.value})} className="w-full rounded border px-3 py-2 text-sm" />
          <input placeholder="Password" type="password" value={createForm.password} onChange={e=> setCreateForm({...createForm, password:e.target.value})} className="w-full rounded border px-3 py-2 text-sm" />
          <input placeholder="Pincode" value={createForm.pincode} onChange={e=> setCreateForm({...createForm, pincode:e.target.value})} className="w-full rounded border px-3 py-2 text-sm" />
          <input placeholder="Address line1" value={createForm.line1} onChange={e=> setCreateForm({...createForm, line1:e.target.value})} className="w-full rounded border px-3 py-2 text-sm" />
          <button onClick={handleCreate} className="rounded bg-emerald-600 px-4 py-2 text-white">Submit</button>
        </div>
      )}

      {selected && (
        <div className="rounded border bg-white p-4 space-y-3">
          <h2 className="font-semibold">Customer Detail: {(selected as Record<string,string>).userCode}</h2>
          <pre className="overflow-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify(selected, null, 2)}</pre>
          <div className="flex gap-2">
            <button onClick={async()=>{
              const id = (selected as Record<string,string>).id;
              const reason = prompt('Reason for milk service PAUSE (min 10 chars)');
              if (!reason) return;
              try { const updated = await updateMilkServiceStatusApi(accessToken, id, { status:'PAUSED', reason }); setSelected(updated as unknown as Record<string,unknown>); } catch(e){ setError((e as Error).message); }
            }} className="rounded border px-3 py-1 text-sm">Pause Milk Service</button>
            <button onClick={async()=>{
              const id = (selected as Record<string,string>).id;
              try { const updated = await updateProductOrderServiceStatusApi(accessToken, id, { status:'PAUSED', reason:'Product service pause test reason longer than 10' }); setSelected(updated as unknown as Record<string,unknown>); } catch(e){ setError((e as Error).message); }
            }} className="rounded border px-3 py-1 text-sm">Pause Product Service</button>
            <button onClick={async()=>{
              const id = (selected as Record<string,string>).id;
              const mondayQty = prompt('Monday quantity (e.g., 0.5, 1, 2, 3.75)?','1');
              if (!mondayQty) return;
              try { const updated = await updateWeeklyScheduleApi(accessToken, id, { monday:{ quantityLitres: Number(mondayQty) }, status:'ACTIVE' }); setSelected(updated as unknown as Record<string,unknown>); } catch(e){ setError((e as Error).message); }
            }} className="rounded border px-3 py-1 text-sm">Update Schedule</button>
            <button onClick={async()=>{
              const id = (selected as Record<string,string>).id;
              const reason = prompt('Suspend reason (min 10 chars)');
              if (!reason) return;
              try { const res = await updateCustomerStatusApi(accessToken, id, { status:'SUSPENDED', reason }); setSelected(res.account as unknown as Record<string,unknown>); } catch(e){ setError((e as Error).message); }
            }} className="rounded border px-3 py-1 text-sm">Suspend Account</button>
            <button onClick={async()=>{
              const id = (selected as Record<string,string>).id;
              const newMobile = prompt('New mobile number');
              if (!newMobile) return;
              try { const updated = await updateCustomerAdminApi(accessToken, id, { mobileNumber: newMobile }); setSelected(updated as unknown as Record<string,unknown>); } catch(e){ setError((e as Error).message); }
            }} className="rounded border px-3 py-1 text-sm">Update Mobile</button>
          </div>
          <div>
            <h3 className="font-semibold mt-4">Add Internal Note</h3>
            <div className="flex gap-2">
              <input placeholder="Note body" value={notes} onChange={e=> setNotes(e.target.value)} className="flex-1 rounded border px-3 py-2 text-sm" />
              <button onClick={async()=>{
                const id = (selected as Record<string,string>).id;
                try { await createNoteApi(accessToken, id, notes); setNotes(''); const t = await getTimelineApi(accessToken, id); setTimeline(t.entries as unknown[]); } catch(e){ setError((e as Error).message); }
              }} className="rounded bg-slate-800 px-4 py-2 text-white text-sm">Add Note</button>
            </div>
          </div>
          <div>
            <h3 className="font-semibold mt-4">Timeline</h3>
            <pre className="overflow-auto rounded bg-slate-50 p-3 text-xs max-h-60">{JSON.stringify(timeline, null, 2)}</pre>
          </div>
        </div>
      )}

      <div className="rounded border bg-white p-4 space-y-3">
        <h2 className="font-semibold">Bulk Import</h2>
        <input type="file" accept=".csv,.xlsx" onChange={e=> setBulkFile(e.target.files?.[0] ?? null)} className="text-sm" />
        <div className="flex gap-2">
          <button disabled={!bulkFile} onClick={()=> handleBulkImport(true)} className="rounded border px-3 py-1 text-sm">Dry Run Preview</button>
          <button disabled={!bulkFile} onClick={()=> handleBulkImport(false)} className="rounded bg-emerald-600 px-3 py-1 text-sm text-white">Import</button>
        </div>
        {bulkPreview ? <pre className="overflow-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify(bulkPreview as Record<string, unknown>, null, 2)}</pre> : null}
        {bulkErrors.length>0 ? <div className="text-sm text-red-600"><div>Row Errors:</div><pre className="text-xs">{JSON.stringify(bulkErrors as Record<string, unknown>[], null, 2)}</pre></div> : null}
      </div>
    </div>
  );
}
