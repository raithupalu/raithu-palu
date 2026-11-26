import { NavLink, Outlet } from 'react-router-dom';
import { apiConfig } from '../lib/apiConfig';

export function AppLayout() {
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3.5 py-2 text-sm font-medium transition ${
      isActive
        ? 'bg-dairy-pasture text-white shadow-sm'
        : 'text-slate-700 hover:bg-dairy-meadow hover:text-dairy-pasture'
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-dairy-cream text-slate-800">
      <header className="sticky top-0 z-20 border-b border-emerald-950/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-dairy-pasture text-lg font-bold text-white shadow-sm">
              RP
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-slate-900">
                  {apiConfig.appName}
                </span>
                <span className="rounded-full bg-dairy-meadow px-2.5 py-0.5 text-xs font-semibold text-dairy-pasture">
                  Phase 0 Foundation
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Dairy Milk Management &amp; Customer Ordering Platform
              </p>
            </div>
          </div>

          <nav aria-label="Main navigation" className="flex items-center gap-2">
            <NavLink to="/" end className={navLinkClass}>
              Platform Overview
            </NavLink>
            <NavLink to="/system-status" className={navLinkClass}>
              System Health
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      <footer className="border-t border-emerald-950/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:px-6 lg:px-8">
          <p>
            &copy; {new Date().getFullYear()} {apiConfig.appName}. Phase 0 Project
            Foundation.
          </p>
          <p>
            API Base: <code className="font-mono text-slate-700">{apiConfig.apiBaseUrl}</code>{' '}
            &middot; Mode: <span className="font-medium text-slate-700">{apiConfig.appEnv}</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
