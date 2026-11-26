import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';

interface LocationRedirectState {
  from?: {
    pathname?: string;
  };
}

export function AdminLoginPage() {
  const {
    user,
    isAuthenticated,
    isInitializing,
    sessionError,
    clearSessionError,
    loginAdmin,
  } = useAuth();
  const location = useLocation();

  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const redirectState = location.state as LocationRedirectState | null;
  const targetPath = redirectState?.from?.pathname || '/admin/accounts';

  if (isInitializing) {
    return (
      <div className="py-12">
        <LoadingState
          title="Checking Existing Session..."
          message="Please wait while we verify your administrator authentication state."
        />
      </div>
    );
  }

  if (isAuthenticated && user) {
    if (user.role === 'ADMIN') {
      return <Navigate to={targetPath} replace />;
    }
    return <Navigate to="/customer/profile" replace />;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    clearSessionError();

    const cleanedMobile = mobileNumber.replace(/[\s\-()]/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanedMobile)) {
      setErrorMessage(
        'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.'
      );
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your administrator password.');
      return;
    }

    setSubmitting(true);
    try {
      await loginAdmin({
        mobileNumber: cleanedMobile,
        password,
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Invalid administrator mobile number or password.'
      );
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
            Admin Console &bull; Phase 1 Step 2
          </span>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">
            Admin Sign In
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Sign in with your operator-provisioned Admin credentials (
            <code className="font-mono text-xs text-dairy-pasture">ADM-XXXX</code>
            ) to manage Staff, Farmer, and Buffalo Grazing Worker accounts.
          </p>
        </div>

        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
          <p className="font-semibold">Operator-Provisioned Access Only</p>
          <p className="mt-0.5 text-amber-800">
            Public Admin registration is disabled. Admin accounts are provisioned
            manually by an authorized technical operator via{' '}
            <code className="font-mono">npm --prefix backend run provision:admin</code>.
          </p>
        </div>

        {displayedError && (
          <div className="mb-6">
            <ErrorState title="Admin Sign-In Failed" message={displayedError} />
          </div>
        )}

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-5"
          noValidate
        >
          <div>
            <label
              htmlFor="admin-login-mobile"
              className="block text-sm font-medium text-slate-800"
            >
              Admin Mobile Number <span className="text-red-600">*</span>
            </label>
            <input
              id="admin-login-mobile"
              name="mobileNumber"
              type="tel"
              required
              inputMode="numeric"
              maxLength={10}
              autoComplete="tel-national"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              placeholder="10-digit Admin mobile number"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
            />
          </div>

          <div>
            <label
              htmlFor="admin-login-password"
              className="block text-sm font-medium text-slate-800"
            >
              Password <span className="text-red-600">*</span>
            </label>
            <input
              id="admin-login-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter administrator password"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-dairy-pasture px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-dairy-pastureDark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Authenticating Admin...' : 'Sign In to Admin Console'}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
          Looking for Customer portal?{' '}
          <Link
            to="/login"
            className="font-semibold text-dairy-pasture hover:underline"
          >
            Customer Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
