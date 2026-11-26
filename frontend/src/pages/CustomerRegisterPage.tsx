import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';

export function CustomerRegisterPage() {
  const { user, isAuthenticated, isInitializing, register } = useAuth();

  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (isInitializing) {
    return (
      <div className="py-12">
        <LoadingState
          title="Checking Existing Session..."
          message="Please wait while we verify your authentication state."
        />
      </div>
    );
  }

  if (isAuthenticated && user) {
    return <Navigate to="/customer/profile" replace />;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      setErrorMessage('Full name must be at least 2 characters long.');
      return;
    }

    const cleanedMobile = mobileNumber.replace(/[\s\-()]/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanedMobile)) {
      setErrorMessage(
        'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.'
      );
      return;
    }

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setErrorMessage(
        'Password must be at least 8 characters and include at least one letter and one number.'
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) {
      setErrorMessage('Pincode must be a valid 6-digit number.');
      return;
    }

    setSubmitting(true);
    try {
      const hasAddress = Boolean(line1.trim() || city.trim() || pincode.trim());
      await register({
        fullName: trimmedName,
        mobileNumber: cleanedMobile,
        password,
        address: hasAddress
          ? {
              line1: line1.trim() || undefined,
              city: city.trim() || undefined,
              pincode: pincode.trim() || undefined,
            }
          : undefined,
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Unable to complete registration. Please check your details.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl py-4">
      <div className="rounded-2xl border border-emerald-900/15 bg-white p-8 shadow-sm sm:p-10">
        <div className="mb-6">
          <span className="inline-flex items-center rounded-full bg-dairy-meadow px-3 py-1 text-xs font-semibold text-dairy-pasture">
            Customer Onboarding &bull; Phase 1 Step 1
          </span>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">
            Create Your Customer Account
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Register with your full name, 10-digit mobile number, and password to
            access your Raithu Palu customer profile.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6">
            <ErrorState title="Registration Error" message={errorMessage} />
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5" noValidate>
          <div>
            <label
              htmlFor="register-full-name"
              className="block text-sm font-medium text-slate-800"
            >
              Full Name <span className="text-red-600">*</span>
            </label>
            <input
              id="register-full-name"
              name="fullName"
              type="text"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Lakshmi Narayana"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
            />
          </div>

          <div>
            <label
              htmlFor="register-mobile"
              className="block text-sm font-medium text-slate-800"
            >
              Mobile Number (10 Digits) <span className="text-red-600">*</span>
            </label>
            <input
              id="register-mobile"
              name="mobileNumber"
              type="tel"
              required
              inputMode="numeric"
              maxLength={10}
              autoComplete="tel-national"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              placeholder="e.g. 9876543210"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
            />
            <p className="mt-1 text-xs text-slate-500">
              Used as your unique sign-in identifier. No SMS OTP is required.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="register-password"
                className="block text-sm font-medium text-slate-800"
              >
                Password <span className="text-red-600">*</span>
              </label>
              <input
                id="register-password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 chars (letters + digits)"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
              />
            </div>

            <div>
              <label
                htmlFor="register-confirm-password"
                className="block text-sm font-medium text-slate-800"
              >
                Confirm Password <span className="text-red-600">*</span>
              </label>
              <input
                id="register-confirm-password"
                name="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
              />
            </div>
          </div>

          <fieldset className="rounded-xl border border-slate-200 bg-dairy-cream/60 p-4">
            <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
              Optional Delivery Address
            </legend>
            <div className="space-y-3 pt-1">
              <div>
                <label
                  htmlFor="register-line1"
                  className="block text-xs font-medium text-slate-700"
                >
                  House / Flat / Street
                </label>
                <input
                  id="register-line1"
                  name="line1"
                  type="text"
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  placeholder="Door No. 12-4, Gandhi Road"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="register-city"
                    className="block text-xs font-medium text-slate-700"
                  >
                    City / Town
                  </label>
                  <input
                    id="register-city"
                    name="city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Tirupati"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="register-pincode"
                    className="block text-xs font-medium text-slate-700"
                  >
                    6-Digit Pincode
                  </label>
                  <input
                    id="register-pincode"
                    name="pincode"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    placeholder="517501"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-dairy-pasture px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-dairy-pastureDark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Creating Customer Account...' : 'Register Customer Account'}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
          Already registered with Raithu Palu?{' '}
          <Link
            to="/login"
            className="font-semibold text-dairy-pasture hover:underline"
          >
            Sign in with your mobile number
          </Link>
        </div>
      </div>
    </div>
  );
}
