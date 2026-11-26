import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorState } from '../components/ErrorState';

export function CustomerProfilePage() {
  const { user, logout, updateProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [line1, setLine1] = useState(user?.address?.line1 ?? '');
  const [line2, setLine2] = useState(user?.address?.line2 ?? '');
  const [landmark, setLandmark] = useState(user?.address?.landmark ?? '');
  const [city, setCity] = useState(user?.address?.city ?? '');
  const [pincode, setPincode] = useState(user?.address?.pincode ?? '');
  const [deliveryNotes, setDeliveryNotes] = useState(
    user?.address?.deliveryNotes ?? ''
  );

  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setLine1(user.address?.line1 ?? '');
      setLine2(user.address?.line2 ?? '');
      setLandmark(user.address?.landmark ?? '');
      setCity(user.address?.city ?? '');
      setPincode(user.address?.pincode ?? '');
      setDeliveryNotes(user.address?.deliveryNotes ?? '');
    }
  }, [user]);

  if (!user) {
    return null;
  }

  async function handleSaveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      setErrorMessage('Full name must be at least 2 characters long.');
      return;
    }

    if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) {
      setErrorMessage('Pincode must be a valid 6-digit number.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        fullName: trimmedName,
        address: {
          line1: line1.trim() || undefined,
          line2: line2.trim() || undefined,
          landmark: landmark.trim() || undefined,
          city: city.trim() || undefined,
          pincode: pincode.trim() || undefined,
          deliveryNotes: deliveryNotes.trim() || undefined,
        },
      });
      setSuccessMessage('Customer profile saved successfully.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to update customer profile.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRefreshProfile() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setRefreshing(true);
    try {
      await refreshProfile();
      setSuccessMessage('Customer profile synchronized with server.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to refresh customer profile.'
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-900/15 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dairy-pasture text-xl font-bold text-white shadow-sm">
            {user.fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">
                {user.fullName}
              </h1>
              <span className="rounded-full bg-dairy-meadow px-2.5 py-0.5 text-xs font-semibold text-dairy-pasture">
                {user.role}
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                {user.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Registered Mobile: <span className="font-mono font-semibold text-slate-900">{user.mobileNumber}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void handleRefreshProfile()}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {refreshing ? 'Refreshing...' : 'Refresh Profile'}
          </button>
          <button
            type="button"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
            className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-800 disabled:opacity-60"
          >
            {loggingOut ? 'Signing Out...' : 'Sign Out'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border border-emerald-900/10 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              Account Security Summary
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-slate-500">Customer ID</dt>
                <dd className="mt-0.5 font-mono text-xs text-slate-800">{user.id}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Mobile Number (Immutable)</dt>
                <dd className="mt-0.5 font-mono font-semibold text-slate-900">
                  +91 {user.mobileNumber}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Assigned Role</dt>
                <dd className="mt-0.5 font-semibold text-dairy-pasture">{user.role}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Last Sign-In</dt>
                <dd className="mt-0.5 text-slate-700">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString()
                    : 'Current session'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Account Created</dt>
                <dd className="mt-0.5 text-slate-700">
                  {new Date(user.createdAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-900/10 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">
            Update Customer Profile &amp; Delivery Address
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Update your name and household delivery address. Your mobile number
            and CUSTOMER role are protected and cannot be changed here.
          </p>

          {errorMessage && (
            <div className="mt-4">
              <ErrorState title="Update Failed" message={errorMessage} />
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900"
            >
              {successMessage}
            </div>
          )}

          <form
            onSubmit={(e) => void handleSaveProfile(e)}
            className="mt-5 space-y-4"
            noValidate
          >
            <div>
              <label
                htmlFor="profile-full-name"
                className="block text-sm font-medium text-slate-800"
              >
                Full Name <span className="text-red-600">*</span>
              </label>
              <input
                id="profile-full-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="profile-line1"
                  className="block text-sm font-medium text-slate-800"
                >
                  Address Line 1
                </label>
                <input
                  id="profile-line1"
                  type="text"
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  placeholder="House / Flat / Street"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-line2"
                  className="block text-sm font-medium text-slate-800"
                >
                  Address Line 2
                </label>
                <input
                  id="profile-line2"
                  type="text"
                  value={line2}
                  onChange={(e) => setLine2(e.target.value)}
                  placeholder="Area / Colony"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="profile-landmark"
                  className="block text-sm font-medium text-slate-800"
                >
                  Landmark
                </label>
                <input
                  id="profile-landmark"
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="Near Temple / Park"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-city"
                  className="block text-sm font-medium text-slate-800"
                >
                  City / Town
                </label>
                <input
                  id="profile-city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Tirupati"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-pincode"
                  className="block text-sm font-medium text-slate-800"
                >
                  6-Digit Pincode
                </label>
                <input
                  id="profile-pincode"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="517501"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="profile-notes"
                className="block text-sm font-medium text-slate-800"
              >
                Delivery Notes
              </label>
              <input
                id="profile-notes"
                type="text"
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="e.g. Ring bell at main gate"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-dairy-pasture px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-dairy-pastureDark disabled:opacity-60"
              >
                {saving ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
