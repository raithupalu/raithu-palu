import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { apiConfig } from '../lib/apiConfig';
import { useAuth } from '../context/AuthContext';

export function AppLayout() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3.5 py-2 text-sm font-medium transition ${
      isActive
        ? 'bg-dairy-pasture text-white shadow-sm'
        : 'text-slate-700 hover:bg-dairy-meadow hover:text-dairy-pasture'
    }`;

  async function handleHeaderLogout() {
    const wasAdmin = user?.role === 'ADMIN';
    await logout();
    navigate(wasAdmin ? '/admin/login' : '/login', { replace: true });
  }

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
                  Phase 1 &bull; Step 2
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Dairy Milk Management &amp; Customer Ordering Platform
              </p>
            </div>
          </div>

          <nav
            aria-label="Main navigation"
            className="flex flex-wrap items-center gap-2"
          >
            <NavLink to="/" end className={navLinkClass}>
              Platform Overview
            </NavLink>
            <NavLink to="/system-status" className={navLinkClass}>
              System Health
            </NavLink>

            {isAuthenticated && user ? (
              <>
                {user.role === 'ADMIN' ? (
                  <NavLink to="/admin/accounts" className={navLinkClass}>
                    Admin Accounts ({user.userCode ?? 'ADM'})
                  </NavLink>
                ) : (
                  <NavLink to="/customer/profile" className={navLinkClass}>
                    Customer Profile ({user.fullName.split(' ')[0]})
                  </NavLink>
                )}
                <button
                  type="button"
                  onClick={() => void handleHeaderLogout()}
                  className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={navLinkClass}>
                  Customer Sign In
                </NavLink>
                <NavLink to="/register" className={navLinkClass}>
                  Register
                </NavLink>
                <NavLink to="/admin/login" className={navLinkClass}>
                  Admin Console
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      <footer className="border-t border-emerald-950/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:px-6 lg:px-8">
          <p>
            &copy; {new Date().getFullYear()} {apiConfig.appName}. Phase 1 Step 2
            Admin Account Management &amp; Customer Authentication.
          </p>
          <p>
            API Base:{' '}
            <code className="font-mono text-slate-700">
              {apiConfig.apiBaseUrl}
            </code>{' '}
            &middot; Mode:{' '}
            <span className="font-medium text-slate-700">
              {apiConfig.appEnv}
            </span>
          </p>
        </div>
      </footer>
    </div>
  );
}
