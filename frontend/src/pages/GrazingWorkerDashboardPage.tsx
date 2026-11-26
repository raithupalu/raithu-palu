import { useAuth } from '../context/AuthContext';

export function GrazingWorkerDashboardPage() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const grazingProfile = user.grazingWorkerProfile;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-600 to-orange-700 p-8 text-white shadow-sm">
        <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">GRAZING WORKER • {user.userCode}</span>
        <h1 className="mt-3 text-3xl font-bold">Grazing Worker Dashboard</h1>
        <p className="mt-1 text-sm text-amber-100">Welcome {user.fullName} — buffalo grazing attendance portal.</p>
        <p className="mt-1 text-xs text-amber-200">Login mobile: {user.mobileNumber} • Status: {user.status}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Assignment Details</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {grazingProfile?.emergencyContactMobile && (
              <div>
                <dt className="text-xs text-slate-500">Emergency Contact Mobile</dt>
                <dd className="font-mono font-semibold text-amber-800">{grazingProfile.emergencyContactMobile}</dd>
              </div>
            )}
            {grazingProfile?.assignedNotes && (
              <div>
                <dt className="text-xs text-slate-500">Assigned Notes</dt>
                <dd className="font-semibold text-slate-900">{grazingProfile.assignedNotes}</dd>
              </div>
            )}
            {!grazingProfile?.emergencyContactMobile && !grazingProfile?.assignedNotes && (
              <p className="text-sm text-slate-500">No assignment details configured.</p>
            )}
          </dl>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Attendance</h2>
          <p className="mt-2 text-sm text-slate-600">4-stage buffalo grazing attendance will be managed here in the next approved phase.</p>
          <p className="mt-3 text-xs text-slate-500">SRA v3.0 — read-only access in this release.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={() => void logout()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Sign Out</button>
      </div>
    </div>
  );
}
