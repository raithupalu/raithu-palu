import { useAuth } from '../context/AuthContext';

export function FarmerDashboardPage() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const farmerProfile = user.farmerProfile;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-600 to-emerald-800 p-8 text-white shadow-sm">
        <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">FARMER • {user.userCode}</span>
        <h1 className="mt-3 text-3xl font-bold">Farmer Dashboard</h1>
        <p className="mt-1 text-sm text-emerald-100">Welcome {user.fullName} — milk supply partner portal.</p>
        <p className="mt-1 text-xs text-emerald-200">Login mobile: {user.mobileNumber} • Business contact: {farmerProfile?.businessContactMobile ?? '—'}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Farmer Profile</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Business Contact Mobile (separate from login)</dt>
              <dd className="font-mono font-semibold text-emerald-800">{farmerProfile?.businessContactMobile ?? 'Not set'}</dd>
            </div>
            {farmerProfile?.villageOrLocation && (
              <div>
                <dt className="text-xs text-slate-500">Village / Location</dt>
                <dd className="font-semibold text-slate-900">{farmerProfile.villageOrLocation}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-slate-500">Supplied Milk Types</dt>
              <dd className="font-semibold text-slate-900">{(farmerProfile?.suppliedMilkTypes ?? ['BUFFALO']).join(', ')}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Status</dt>
              <dd className="font-semibold">{user.status}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Next Steps</h2>
          <p className="mt-2 text-sm text-slate-600">Farmer milk collection and settlement history will appear here in the approved next phase.</p>
          <p className="mt-3 text-xs text-slate-500">SRA v3.0 — Farmer operations are read-only in this release.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={() => void logout()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Sign Out</button>
      </div>
    </div>
  );
}
