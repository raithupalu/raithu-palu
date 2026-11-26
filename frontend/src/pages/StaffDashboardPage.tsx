import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchSystemHealth, type HealthResponse } from '../lib/apiConfig';

export function StaffDashboardPage() {
  const { user, logout } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      const h = await fetchSystemHealth();
      setHealth(h);
    } catch {}
  }, []);
  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  if (!user) return null;

  const permissions = user.staffPermissions ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-600 to-blue-800 p-8 text-white shadow-sm">
        <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">STAFF • STF-{user.userCode?.slice(-4)}</span>
        <h1 className="mt-3 text-3xl font-bold">Staff Dashboard</h1>
        <p className="mt-1 text-sm text-blue-100">Welcome {user.fullName} ({user.userCode}) — view-only operational access.</p>
        <p className="mt-1 text-xs text-blue-200">Login mobile: {user.mobileNumber} • Status: {user.status}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Your View-Only Permissions</h2>
          <p className="mt-1 text-xs text-slate-500">Configured by Admin — you cannot modify your own permissions.</p>
          <div className="mt-4 space-y-2">
            {permissions.length === 0 ? (
              <p className="text-sm text-slate-500">No permissions granted yet. Contact your Admin.</p>
            ) : (
              permissions.map((p) => (
                <div key={p} className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-900">
                  <span className="h-2 w-2 rounded-full bg-blue-600" /> {p}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Quick Actions</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>• View Customers → <code className="text-xs">GET /api/staff/views/customers</code></li>
            <li>• View Farmer Supply → <code className="text-xs">/api/staff/views/farmer-supply</code></li>
            <li>• View Billing → <code className="text-xs">/api/staff/views/billing</code></li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">Write attempts will be rejected with 403 FORBIDDEN_STAFF_WRITE.</p>
        </div>
      </div>

      {health && (
        <div className="rounded-xl border bg-white p-5 text-xs text-slate-600">Backend: {health.application.status} • DB: {health.database.status}</div>
      )}

      <div className="flex justify-end">
        <button onClick={() => void logout()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Sign Out</button>
      </div>
    </div>
  );
}
