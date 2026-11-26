import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchSystemHealth, type HealthResponse } from '../lib/apiConfig';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

interface PlannedModuleItem {
  title: string;
  description: string;
  phaseLabel: string;
}

const PLANNED_MODULES: readonly PlannedModuleItem[] = [
  {
    title: 'Identity & Role Governance',
    description:
      'Role-based access foundation for Admin, Customer, Staff, Farmer/Milk Supplier, and Buffalo Grazing Worker accounts.',
    phaseLabel: 'Deferred to Approved Phase',
  },
  {
    title: 'Daily Buffalo Milk Delivery & Billing',
    description:
      'Single daily buffalo milk delivery tracking, emergency delivery records, and monthly bill generation.',
    phaseLabel: 'Deferred to Approved Phase',
  },
  {
    title: 'Financial Ledger & Advance Credits',
    description:
      'Immutable customer payments, FIFO invoice allocations, advance credit provenance, and concurrency-guarded reversals.',
    phaseLabel: 'Deferred to Approved Phase',
  },
  {
    title: 'Farmer Procurement & Grazing Operations',
    description:
      'Milk supply quality logs, bi-monthly farmer settlements, and 4-stage camera-captured grazing attendance.',
    phaseLabel: 'Deferred to Approved Phase',
  },
];

export function LandingDashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSystemHealth();
      setHealth(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not reach the Raithu Palu backend health endpoint.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-emerald-900/15 bg-gradient-to-br from-dairy-pasture to-dairy-pastureDark p-8 text-white shadow-sm sm:p-10">
        <div className="max-w-3xl space-y-4">
          <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-50">
            PHASE 0 &bull; INFRASTRUCTURE &amp; MONOREPO FOUNDATION
          </span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Raithu Palu Dairy Management &amp; Customer Ordering Platform
          </h1>
          <p className="text-sm leading-relaxed text-emerald-50/90 sm:text-base">
            Welcome to the Phase 0 foundation of Raithu Palu. The React + Vite +
            Tailwind CSS frontend (`frontend/`) and Node.js + Express + Mongoose
            backend (`backend/`) are configured and connected. Business workflows
            remain locked until subsequent phases are approved.
          </p>
          <div className="pt-2">
            <Link
              to="/system-status"
              className="inline-flex items-center rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-dairy-pasture shadow-sm transition hover:bg-emerald-50"
            >
              Inspect Live System Health &rarr;
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="runtime-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="runtime-heading" className="text-lg font-bold text-slate-900">
              Live Backend &amp; Database Connectivity
            </h2>
            <p className="text-xs text-slate-500">
              Real-time status reported by <code className="font-mono">GET /api/health</code>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadHealth()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Refresh Status
          </button>
        </div>

        {loading && (
          <LoadingState
            compact
            title="Checking Backend Connectivity..."
            message="Querying GET /api/health for application and MongoDB status."
          />
        )}

        {!loading && error && (
          <ErrorState
            title="Backend Health Check Unreachable"
            message={error}
            onRetry={() => void loadHealth()}
          />
        )}

        {!loading && !error && health && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-900/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Application Server
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                <span className="text-lg font-bold capitalize text-slate-900">
                  {health.application.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Environment: <span className="font-medium">{health.application.environment}</span>{' '}
                &bull; Uptime: {health.application.uptimeSeconds}s
              </p>
            </div>

            <div className="rounded-xl border border-emerald-900/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                MongoDB Connectivity
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    health.database.connected ? 'bg-emerald-600' : 'bg-amber-500'
                  }`}
                />
                <span className="text-lg font-bold capitalize text-slate-900">
                  {health.database.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Replica-set transactions required:{' '}
                <span className="font-medium">
                  {health.database.transactionsRequired ? 'Yes' : 'No'}
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-emerald-900/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Active Implementation Phase
              </p>
              <p className="mt-2 text-lg font-bold text-slate-900">{health.phase}</p>
              <p className="mt-1 text-xs text-slate-500">
                Last checked: {new Date(health.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="roadmap-heading" className="space-y-4">
        <div>
          <h2 id="roadmap-heading" className="text-lg font-bold text-slate-900">
            Architecture Scope Placeholders (Unimplemented in Phase 0)
          </h2>
          <p className="text-xs text-slate-500">
            The modules below are intentionally omitted in Phase 0 per strict scope
            governance.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {PLANNED_MODULES.map((mod) => (
            <div
              key={mod.title}
              className="flex flex-col justify-between rounded-xl border border-emerald-900/10 bg-white p-5 shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-900">
                    {mod.title}
                  </h3>
                  <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {mod.phaseLabel}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {mod.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
