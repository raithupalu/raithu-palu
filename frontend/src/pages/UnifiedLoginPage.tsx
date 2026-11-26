import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { getDashboardPathForRole } from '../lib/roleRouting';

interface LocationRedirectState {
  from?: { pathname?: string };
}

export function UnifiedLoginPage() {
  const { user, isAuthenticated, isInitializing, sessionError, clearSessionError, loginUnified } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const redirectState = location.state as LocationRedirectState | null;

  if (isInitializing) {
    return (
      <div className="py-12">
        <LoadingState title="Checking Existing Session..." message="Please wait while we verify your authentication state." />
      </div>
    );
  }

  if (isAuthenticated && user) {
    // If already authenticated, redirect to role dashboard unless a specific safe target exists
    const fromPath = redirectState?.from?.pathname;
    // Prevent redirect loop to login itself
    if (fromPath && fromPath !== '/login' && fromPath !== '/admin/login') {
      return <Navigate to={fromPath} replace />;
    }
    const dashboardPath = getDashboardPathForRole(user.role);
    return <Navigate to={dashboardPath} replace />;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    clearSessionError();

    const cleanedMobile = mobileNumber.replace(/[\s\-()]/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanedMobile)) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      const loggedInUser = await loginUnified({ mobileNumber: cleanedMobile, password });
      const targetFromState = (location.state as LocationRedirectState | null)?.from?.pathname;
      // Only honor from-path if it is plausible and not the login page itself
      let targetPath: string;
      if (targetFromState && targetFromState !== '/login' && targetFromState !== '/admin/login') {
        targetPath = targetFromState;
      } else {
        targetPath = getDashboardPathForRole(loggedInUser.role);
      }
      navigate(targetPath, { replace: true });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Invalid mobile number or password.');
    } finally {
      setSubmitting(false);
    }
  }

  const displayedError = errorMessage ?? sessionError;

  return (
    <div className="mx-auto max-w-md py-6">
      <div className="rounded-2xl border border-emerald-900/15 bg-white p-8 shadow-sm sm:p-10">
        <div className="mb-6">
          <span className="inline-flex items-center rounded-full bg-dairy-meadow px-3 py-1 text-xs font-semibold text-dairy-pasture">
            Raithu Palu • Unified Sign In
          </span>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Sign In</h1>
          <p className="mt-1 text-sm text-slate-600">
            Use your registered 10-digit mobile number and password. You will be redirected to your role dashboard automatically.
          </p>
        </div>

        {displayedError && (
          <div className="mb-6">
            <ErrorState title="Sign-In Failed" message={displayedError} />
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5" noValidate>
          <div>
            <label htmlFor="login-mobile" className="block text-sm font-medium text-slate-800">
              Mobile Number <span className="text-red-600">*</span>
            </label>
            <input
              id="login-mobile"
              name="mobileNumber"
              type="tel"
              required
              inputMode="numeric"
              maxLength={10}
              autoComplete="tel-national"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              placeholder="10-digit mobile number"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-800">
              Password <span className="text-red-600">*</span>
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-dairy-pasture px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-dairy-pastureDark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
          Customer onboarding?{' '}
          <Link to="/register" className="font-semibold text-dairy-pasture hover:underline">
            Create a Customer account
          </Link>
        </div>

        <p className="mt-3 text-center text-xs text-slate-500">Role is determined securely from your authenticated account — no selection needed.</p>
      </div>
    </div>
  );
}
