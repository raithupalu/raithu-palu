import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorState } from '../components/ErrorState';
import { buildApiUrl } from '../lib/apiConfig';
import { buildAuthHeaders } from '../lib/authApi';

export function CustomerProfilePage() {
  const { user, logout, updateProfile, refreshProfile, accessToken } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [line1, setLine1] = useState(user?.address?.line1 ?? '');
  const [line2, setLine2] = useState(user?.address?.line2 ?? '');
  const [landmark, setLandmark] = useState(user?.address?.landmark ?? '');
  const [city, setCity] = useState(user?.address?.city ?? '');
  const [pincode, setPincode] = useState(user?.address?.pincode ?? '');
  const [deliveryNotes, setDeliveryNotes] = useState(user?.address?.deliveryNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Multiple addresses
  const [addresses, setAddresses] = useState<unknown[]>(user?.deliveryAddresses ?? []);
  const [newAddr, setNewAddr] = useState({ label:'HOME', line1:'', city:'', pincode:'' });
  // Password change
  const [showPassword, setShowPassword] = useState(user?.mustChangePassword ?? false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setLine1(user.address?.line1 ?? '');
      setLine2(user.address?.line2 ?? '');
      setLandmark(user.address?.landmark ?? '');
      setCity(user.address?.city ?? '');
      setPincode(user.address?.pincode ?? '');
      setDeliveryNotes(user.address?.deliveryNotes ?? '');
      setAddresses(user.deliveryAddresses ?? []);
      setShowPassword(user.mustChangePassword ?? false);
    }
  }, [user]);

  if (!user) return null;

  async function handleSaveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) { setErrorMessage('Full name must be at least 2 chars'); return; }
    if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) { setErrorMessage('Pincode must be 6-digit'); return; }
    setSaving(true);
    try {
      await updateProfile({ fullName: trimmedName, address: { line1: line1.trim()||undefined, line2: line2.trim()||undefined, landmark: landmark.trim()||undefined, city: city.trim()||undefined, pincode: pincode.trim()||undefined, deliveryNotes: deliveryNotes.trim()||undefined } });
      setSuccessMessage('Profile saved');
    } catch (err) { setErrorMessage(err instanceof Error ? err.message : 'Failed'); } finally { setSaving(false); }
  }

  async function handleRefreshProfile() {
    setErrorMessage(null); setSuccessMessage(null); setRefreshing(true);
    try { await refreshProfile(); setSuccessMessage('Profile synchronized'); } catch (err) { setErrorMessage(err instanceof Error ? err.message : 'Failed'); } finally { setRefreshing(false); }
  }
  async function handleLogout(){ setLoggingOut(true); try{ await logout(); navigate('/login',{replace:true}); } finally { setLoggingOut(false); } }

  async function handleAddAddress(){
    setErrorMessage(null);
    try {
      const res = await fetch(buildApiUrl('/customer/addresses'), { method:'POST', headers: buildAuthHeaders(accessToken,true) as Record<string,string>, credentials:'include', body: JSON.stringify({ label:newAddr.label, line1:newAddr.line1, city:newAddr.city, pincode:newAddr.pincode }) });
      if (!res.ok) { const j=await res.json() as Record<string,unknown>; throw new Error(String(j.message ?? 'Add failed')); }
      const j = await res.json() as { data:{ profile: { deliveryAddresses: unknown[] } } };
      setAddresses(j.data.profile.deliveryAddresses ?? []);
      setSuccessMessage('Address added');
      void refreshProfile();
    } catch(e){ setErrorMessage(e instanceof Error ? e.message : 'Add failed'); }
  }
  async function handleActivate(addressId:string){
    try {
      const res = await fetch(buildApiUrl(`/customer/addresses/${encodeURIComponent(addressId)}/activate`), { method:'POST', headers: buildAuthHeaders(accessToken,false) as Record<string,string>, credentials:'include' });
      if (!res.ok) { const j=await res.json() as Record<string,unknown>; throw new Error(String(j.message)); }
      void refreshProfile();
      setSuccessMessage('Active address changed');
    } catch(e){ setErrorMessage(e instanceof Error ? e.message : 'Activate failed'); }
  }
  async function handleArchive(addressId:string){
    try {
      const res = await fetch(buildApiUrl(`/customer/addresses/${encodeURIComponent(addressId)}/archive`), { method:'POST', headers: buildAuthHeaders(accessToken,false) as Record<string,string>, credentials:'include' });
      if (!res.ok) { const j=await res.json() as Record<string,unknown>; throw new Error(String(j.message)); }
      void refreshProfile();
      setSuccessMessage('Address archived');
    } catch(e){ setErrorMessage(e instanceof Error ? e.message : 'Archive failed'); }
  }
  async function handleChangePassword(e: FormEvent){
    e.preventDefault();
    setErrorMessage(null);
    try {
      const res = await fetch(buildApiUrl('/auth/change-password'), { method:'POST', headers: buildAuthHeaders(accessToken,true) as Record<string,string>, credentials:'include', body: JSON.stringify({ currentPassword, newPassword }) });
      if (!res.ok) { const j=await res.json() as Record<string,unknown>; throw new Error(String(j.message)); }
      setShowPassword(false);
      setSuccessMessage('Password changed');
      void refreshProfile();
    } catch(e){ setErrorMessage(e instanceof Error ? e.message : 'Change failed'); }
  }

  return (
    <div className="space-y-6">
      {user.mustChangePassword && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-900">You must change your initial password before continuing</h3>
          <p className="text-sm text-amber-800">Admin created your account. Please set a new password.</p>
          <form onSubmit={handleChangePassword} className="mt-3 flex gap-2">
            <input type="password" placeholder="Current password" value={currentPassword} onChange={e=> setCurrentPassword(e.target.value)} className="rounded border px-3 py-2 text-sm" />
            <input type="password" placeholder="New password" value={newPassword} onChange={e=> setNewPassword(e.target.value)} className="rounded border px-3 py-2 text-sm" />
            <button type="submit" className="rounded bg-amber-600 px-4 py-2 text-white text-sm">Change Password</button>
          </form>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-900/15 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dairy-pasture text-xl font-bold text-white shadow-sm">{user.fullName.charAt(0).toUpperCase()}</div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{user.fullName}</h1>
              <span className="rounded-full bg-dairy-meadow px-2.5 py-0.5 text-xs font-semibold text-dairy-pasture">{user.role}</span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">{user.status}</span>
              {user.milkServiceStatus && <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">Milk: {user.milkServiceStatus}</span>}
              {user.productOrderServiceStatus && <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-800">Product: {user.productOrderServiceStatus}</span>}
            </div>
            <p className="mt-1 text-sm text-slate-600">Registered Mobile: <span className="font-mono font-semibold text-slate-900">{user.mobileNumber}</span></p>
            <p className="text-xs text-slate-500">Customer ID: {user.userCode} | {user.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" disabled={refreshing} onClick={()=> void handleRefreshProfile()} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700"> {refreshing ? 'Refreshing...' : 'Refresh Profile'}</button>
          <button type="button" disabled={loggingOut} onClick={()=> void handleLogout()} className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white">{loggingOut ? 'Signing Out...' : 'Sign Out'}</button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border border-emerald-900/10 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Account Security Summary</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="text-xs font-medium text-slate-500">Customer ID</dt><dd className="mt-0.5 font-mono text-xs text-slate-800">{user.id}</dd></div>
              <div><dt className="text-xs font-medium text-slate-500">Mobile Number (Immutable)</dt><dd className="mt-0.5 font-mono font-semibold text-slate-900">+91 {user.mobileNumber}</dd></div>
              <div><dt className="text-xs font-medium text-slate-500">Assigned Role</dt><dd className="mt-0.5 font-semibold text-dairy-pasture">{user.role}</dd></div>
              <div><dt className="text-xs font-medium text-slate-500">Last Sign-In</dt><dd className="mt-0.5 text-slate-700">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Current session'}</dd></div>
              <div><dt className="text-xs font-medium text-slate-500">Account Created</dt><dd className="mt-0.5 text-slate-700">{new Date(user.createdAt).toLocaleDateString()}</dd></div>
            </dl>
            {user.weeklyMilkSchedule && (
              <div className="mt-4 rounded border bg-slate-50 p-3">
                <h3 className="text-sm font-semibold">Weekly Schedule ({user.weeklyMilkSchedule.status})</h3>
                <div className="mt-2 grid grid-cols-7 gap-1 text-xs text-center">
                  {(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const).map(d=> (
                    <div key={d} className="rounded bg-white p-1 border"><div className="font-semibold">{d.slice(0,3)}</div><div>{(user.weeklyMilkSchedule as unknown as Record<string,{quantityLitres:number}>)[d]?.quantityLitres ?? 0}L</div></div>
                  ))}
                </div>
                {user.weeklyMilkSchedule.pausedUntil && <div className="text-xs text-amber-700 mt-2">Paused until {new Date(user.weeklyMilkSchedule.pausedUntil).toLocaleDateString()}</div>}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-emerald-900/10 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Delivery Addresses</h2>
            <div className="mt-3 space-y-2">
              {addresses.length===0 && <p className="text-xs text-slate-500">No saved addresses. Add one below.</p>}
              {addresses.map((a: unknown)=>{
                const addr = a as Record<string,string|boolean>;
                const isActive = addr.addressId === user.activeDeliveryAddressId;
                return (
                  <div key={String(addr.addressId)} className={`rounded border p-3 text-sm ${isActive? 'border-emerald-400 bg-emerald-50' : 'bg-white'} ${addr.isArchived ? 'opacity-60' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{String(addr.label)} {isActive && <span className="ml-2 rounded bg-emerald-600 px-1.5 py-0.5 text-xs text-white">ACTIVE</span>} {addr.isArchived && <span className="ml-1 rounded bg-slate-400 px-1.5 py-0.5 text-xs text-white">ARCHIVED</span>}</span>
                      <span className="font-mono text-xs">{String(addr.pincode)}</span>
                    </div>
                    <div className="text-xs text-slate-600">{String(addr.line1)} {String(addr.city ?? '')}</div>
                    {!addr.isArchived && (
                      <div className="mt-2 flex gap-2">
                        {!isActive && <button onClick={()=> handleActivate(String(addr.addressId))} className="rounded border px-2 py-1 text-xs">Set Active</button>}
                        {!isActive && <button onClick={()=> handleArchive(String(addr.addressId))} className="rounded border px-2 py-1 text-xs">Archive</button>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 space-y-2 rounded border bg-slate-50 p-3">
              <h3 className="text-sm font-semibold">Add New Address</h3>
              <select value={newAddr.label} onChange={e=> setNewAddr({...newAddr, label:e.target.value})} className="w-full rounded border px-3 py-2 text-sm"><option value="HOME">HOME</option><option value="OFFICE">OFFICE</option><option value="OTHER">OTHER</option></select>
              <input placeholder="Line1" value={newAddr.line1} onChange={e=> setNewAddr({...newAddr, line1:e.target.value})} className="w-full rounded border px-3 py-2 text-sm" />
              <input placeholder="City" value={newAddr.city} onChange={e=> setNewAddr({...newAddr, city:e.target.value})} className="w-full rounded border px-3 py-2 text-sm" />
              <input placeholder="Pincode 6-digit" value={newAddr.pincode} onChange={e=> setNewAddr({...newAddr, pincode:e.target.value})} className="w-full rounded border px-3 py-2 text-sm" />
              <button onClick={handleAddAddress} className="w-full rounded bg-emerald-600 px-3 py-2 text-sm text-white">Add Address</button>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-emerald-900/10 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Update Customer Profile &amp; Delivery Address</h2>
          <p className="mt-1 text-xs text-slate-500">Update your name. Your mobile number and role are protected.</p>
          {errorMessage && (<div className="mt-4"><ErrorState title="Update Failed" message={errorMessage} /></div>)}
          {successMessage && (<div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">{successMessage}</div>)}
          <form onSubmit={(e)=> void handleSaveProfile(e)} className="mt-5 space-y-4" noValidate>
            <div><label htmlFor="profile-full-name" className="block text-sm font-medium text-slate-800">Full Name <span className="text-red-600">*</span></label><input id="profile-full-name" type="text" required value={fullName} onChange={(e)=> setFullName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm" /></div>
            <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="profile-line1" className="block text-sm font-medium text-slate-800">Address Line 1</label><input id="profile-line1" type="text" value={line1} onChange={(e)=> setLine1(e.target.value)} placeholder="House / Flat / Street" className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm" /></div><div><label htmlFor="profile-line2" className="block text-sm font-medium text-slate-800">Address Line 2</label><input id="profile-line2" type="text" value={line2} onChange={(e)=> setLine2(e.target.value)} placeholder="Area / Colony" className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm" /></div></div>
            <div className="grid gap-4 sm:grid-cols-3"><div><label htmlFor="profile-landmark" className="block text-sm font-medium text-slate-800">Landmark</label><input id="profile-landmark" type="text" value={landmark} onChange={(e)=> setLandmark(e.target.value)} placeholder="Near Temple" className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm" /></div><div><label htmlFor="profile-city" className="block text-sm font-medium text-slate-800">City / Town</label><input id="profile-city" type="text" value={city} onChange={(e)=> setCity(e.target.value)} placeholder="Tirupati" className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm" /></div><div><label htmlFor="profile-pincode" className="block text-sm font-medium text-slate-800">6-Digit Pincode</label><input id="profile-pincode" type="text" inputMode="numeric" maxLength={6} value={pincode} onChange={(e)=> setPincode(e.target.value)} placeholder="517501" className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm" /></div></div>
            <div><label htmlFor="profile-notes" className="block text-sm font-medium text-slate-800">Delivery Notes</label><input id="profile-notes" type="text" value={deliveryNotes} onChange={(e)=> setDeliveryNotes(e.target.value)} placeholder="e.g. Ring bell" className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm" /></div>
            <div className="pt-2"><button type="submit" disabled={saving} className="rounded-lg bg-dairy-pasture px-5 py-2.5 text-sm font-semibold text-white">{saving ? 'Saving...' : 'Save Profile Changes'}</button></div>
          </form>
          {showPassword && (
            <div className="mt-6 rounded border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold">Change Password (Required)</h3>
              <form onSubmit={handleChangePassword} className="mt-2 flex flex-col gap-2">
                <input type="password" placeholder="Current password" value={currentPassword} onChange={e=> setCurrentPassword(e.target.value)} className="rounded border px-3 py-2 text-sm" />
                <input type="password" placeholder="New password (min 8, letter+number)" value={newPassword} onChange={e=> setNewPassword(e.target.value)} className="rounded border px-3 py-2 text-sm" />
                <button type="submit" className="rounded bg-amber-600 px-4 py-2 text-sm text-white">Change Password</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
