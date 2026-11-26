import { useEffect, useState, useCallback } from 'react';
import { apiConfig, buildApiUrl, fetchSystemHealth, type HealthResponse } from '../lib/apiConfig';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export function SystemStatusPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSystemHealth();
      setHealth(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to retrieve health status from backend.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            System Health &amp; Configuration Diagnostics
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Verifies centralized frontend API configuration and backend{' '}
            <code className="font-mono text-xs">{buildApiUrl('/health')}</code> response.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void checkHealth()}
          className="rounded-lg bg-dairy-pasture px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-dairy-pastureDark"
        >
          Run Health Check
        </button>
      </div>

      <div className="rounded-xl border border-emerald-900/10 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Frontend Environment Configuration
        </h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-dairy-cream p-3.5">
            <dt className="text-xs font-medium text-slate-500">Application Name</dt>
            <dd className="mt-1 font-semibold text-slate-900">{apiConfig.appName}</dd>
          </div>
          <div className="rounded-lg bg-dairy-cream p-3.5">
            <dt className="text-xs font-medium text-slate-500">Frontend Mode</dt>
            <dd className="mt-1 font-semibold text-slate-900">{apiConfig.appEnv}</dd>
          </div>
          <div className="rounded-lg bg-dairy-cream p-3.5">
            <dt className="text-xs font-medium text-slate-500">Configured API Base URL</dt>
            <dd className="mt-1 font-mono font-semibold text-slate-900">
              {apiConfig.apiBaseUrl}
            </dd>
          </div>
        </dl>
      </div>

      {loading && (
        <LoadingState
          title="Querying Backend Health Endpoint..."
          message={`Requesting ${buildApiUrl('/health')}`}
        />
      )}

      {!loading && error && (
        <ErrorState
          title="Health Check Request Failed"
          message={error}
          onRetry={() => void checkHealth()}
        />
      )}

      {!loading && !error && health && (
        <div className="rounded-xl border border-emerald-900/10 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Sanitized Backend Health Payload (<code className="font-mono text-xs">GET /api/health</code>)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Application status and database connectivity are reported separately
            without exposing credentials or connection strings.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-xs text-emerald-300">
            {JSON.stringify(health, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
