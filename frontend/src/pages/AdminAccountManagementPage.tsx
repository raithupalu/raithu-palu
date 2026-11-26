import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  type UserProfile,
  type ManagedUserRole,
  type UserStatus,
  type StaffPermission,
  type MilkType,
  type AccountSummaryMetrics,
  type AuditLogEntry,
  fetchAdminAccountsApi,
  fetchAdminAccountDetailsApi,
  createAdminManagedAccountApi,
  updateAdminManagedAccountApi,
  updateAdminAccountStatusApi,
  fetchAdminAuditLogsApi,
} from '../lib/authApi';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';

const STAFF_PERMISSION_LABELS: Record<
  StaffPermission,
  { label: string; description: string }
> = {
  VIEW_CUSTOMERS: {
    label: 'View Customers',
    description: 'Read-only access to customer directory and delivery addresses.',
  },
  VIEW_DAILY_DELIVERIES: {
    label: 'View Daily Deliveries',
    description: 'Read-only access to daily buffalo milk delivery schedules.',
  },
  VIEW_BILLING: {
    label: 'View Billing & Invoices',
    description: 'Read-only access to monthly milk bills and payment status.',
  },
  VIEW_PRODUCT_ORDERS: {
    label: 'View Product Orders',
    description: 'Read-only access to one-time dairy product orders.',
  },
  VIEW_FARMER_SUPPLY: {
    label: 'View Farmer Supply',
    description: 'Read-only access to farmer milk procurement logs.',
  },
  VIEW_GRAZING_ATTENDANCE: {
    label: 'View Grazing Attendance',
    description: 'Read-only access to 4-stage buffalo grazing attendance.',
  },
};

const ALL_STAFF_PERMISSIONS: StaffPermission[] = [
  'VIEW_CUSTOMERS',
  'VIEW_DAILY_DELIVERIES',
  'VIEW_BILLING',
  'VIEW_PRODUCT_ORDERS',
  'VIEW_FARMER_SUPPLY',
  'VIEW_GRAZING_ATTENDANCE',
];

function getRoleDisplayLabel(role: string): string {
  switch (role) {
    case 'STAFF':
      return 'Staff';
    case 'FARMER':
      return 'Farmer / Milk Supplier';
    case 'GRAZING_WORKER':
      return 'Buffalo Grazing Worker';
    case 'CUSTOMER':
      return 'Customer';
    case 'ADMIN':
      return 'Administrator';
    default:
      return role;
  }
}

function getRoleBadgeStyle(role: string): string {
  switch (role) {
    case 'STAFF':
      return 'bg-blue-50 text-blue-800 border-blue-200';
    case 'FARMER':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'GRAZING_WORKER':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'CUSTOMER':
      return 'bg-purple-50 text-purple-800 border-purple-200';
    case 'ADMIN':
      return 'bg-slate-800 text-white border-slate-900';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function getStatusBadgeStyle(status: UserStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'INACTIVE':
      return 'bg-slate-100 text-slate-700 border-slate-300';
    case 'SUSPENDED':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'BLOCKED':
      return 'bg-red-100 text-red-800 border-red-300';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export function AdminAccountManagementPage() {
  const { user: adminUser, accessToken } = useAuth();

  const [roleFilter, setRoleFilter] = useState<string>('ALL_MANAGED');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [accounts, setAccounts] = useState<UserProfile[]>([]);
  const [metrics, setMetrics] = useState<AccountSummaryMetrics | null>(null);
  const [recentAuditLogs, setRecentAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [listError, setListError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Create Account Form State
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [createRole, setCreateRole] = useState<ManagedUserRole>('STAFF');
  const [createFullName, setCreateFullName] = useState<string>('');
  const [createMobileNumber, setCreateMobileNumber] = useState<string>('');
  const [createPassword, setCreatePassword] = useState<string>('');
  const [createStaffPermissions, setCreateStaffPermissions] = useState<
    StaffPermission[]
  >([]);
  const [createFarmerBusinessMobile, setCreateFarmerBusinessMobile] =
    useState<string>('');
  const [createFarmerVillage, setCreateFarmerVillage] = useState<string>('');
  const [createFarmerMilkTypes, setCreateFarmerMilkTypes] = useState<
    MilkType[]
  >(['BUFFALO']);
  const [createGrazingEmergencyMobile, setCreateGrazingEmergencyMobile] =
    useState<string>('');
  const [createGrazingNotes, setCreateGrazingNotes] = useState<string>('');
  const [creatingAccount, setCreatingAccount] = useState<boolean>(false);
  const [createFormError, setCreateFormError] = useState<string | null>(null);

  // Selected Account Details & Edit State
  const [selectedAccount, setSelectedAccount] = useState<UserProfile | null>(
    null
  );
  const [selectedAccountLogs, setSelectedAccountLogs] = useState<
    AuditLogEntry[]
  >([]);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  const [editFullName, setEditFullName] = useState<string>('');
  const [editMobileNumber, setEditMobileNumber] = useState<string>('');
  const [editPassword, setEditPassword] = useState<string>('');
  const [editStaffPermissions, setEditStaffPermissions] = useState<
    StaffPermission[]
  >([]);
  const [editFarmerBusinessMobile, setEditFarmerBusinessMobile] =
    useState<string>('');
  const [editFarmerVillage, setEditFarmerVillage] = useState<string>('');
  const [editFarmerMilkTypes, setEditFarmerMilkTypes] = useState<MilkType[]>([
    'BUFFALO',
  ]);
  const [editGrazingEmergencyMobile, setEditGrazingEmergencyMobile] =
    useState<string>('');
  const [editGrazingNotes, setEditGrazingNotes] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Status Change State
  const [targetStatus, setTargetStatus] = useState<UserStatus>('ACTIVE');
  const [statusReason, setStatusReason] = useState<string>('');
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);

  const loadAccountsAndLogs = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const [accountsResult, auditLogsResult] = await Promise.all([
        fetchAdminAccountsApi(accessToken, {
          role: roleFilter,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          search: searchQuery.trim() || undefined,
        }),
        fetchAdminAuditLogsApi(accessToken, 12),
      ]);
      setAccounts(accountsResult.accounts);
      setMetrics(accountsResult.metrics);
      setRecentAuditLogs(auditLogsResult);
    } catch (err) {
      setListError(
        err instanceof Error
          ? err.message
          : 'Failed to load managed accounts.'
      );
    } finally {
      setLoadingList(false);
    }
  }, [accessToken, roleFilter, statusFilter, searchQuery]);

  useEffect(() => {
    void loadAccountsAndLogs();
  }, [loadAccountsAndLogs]);

  function populateEditForm(account: UserProfile) {
    setEditFullName(account.fullName);
    setEditMobileNumber(account.mobileNumber);
    setEditPassword('');
    setEditStaffPermissions(account.staffPermissions ?? []);
    setEditFarmerBusinessMobile(
      account.farmerProfile?.businessContactMobile ?? ''
    );
    setEditFarmerVillage(account.farmerProfile?.villageOrLocation ?? '');
    setEditFarmerMilkTypes(
      account.farmerProfile?.suppliedMilkTypes ?? ['BUFFALO']
    );
    setEditGrazingEmergencyMobile(
      account.grazingWorkerProfile?.emergencyContactMobile ?? ''
    );
    setEditGrazingNotes(account.grazingWorkerProfile?.assignedNotes ?? '');
    setTargetStatus(account.status);
    setStatusReason(account.statusReason ?? '');
    setEditError(null);
  }

  async function handleSelectAccount(account: UserProfile) {
    setSelectedAccount(account);
    populateEditForm(account);
    setLoadingDetails(true);
    try {
      const details = await fetchAdminAccountDetailsApi(
        accessToken,
        account.id
      );
      setSelectedAccount(details.account);
      populateEditForm(details.account);
      setSelectedAccountLogs(details.auditLogs);
    } catch {
      // Keep list-level account data if detail fetch fails
    } finally {
      setLoadingDetails(false);
    }
  }

  function togglePermissionInList(
    list: StaffPermission[],
    perm: StaffPermission
  ): StaffPermission[] {
    return list.includes(perm)
      ? list.filter((p) => p !== perm)
      : [...list, perm];
  }

  function toggleMilkTypeInList(
    list: MilkType[],
    milkType: MilkType
  ): MilkType[] {
    if (list.includes(milkType)) {
      if (list.length === 1) return list; // Keep at least one milk type
      return list.filter((m) => m !== milkType);
    }
    return [...list, milkType];
  }

  async function handleCreateAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateFormError(null);
    setFeedbackBanner(null);

    const cleanedLoginMobile = createMobileNumber.replace(/[\s\-()]/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanedLoginMobile)) {
      setCreateFormError(
        'Login mobile number must be a valid 10-digit Indian mobile number starting with 6–9.'
      );
      return;
    }

    if (createFullName.trim().length < 2) {
      setCreateFormError('Full name must be at least 2 characters.');
      return;
    }

    if (
      createPassword.length < 8 ||
      !/[A-Za-z]/.test(createPassword) ||
      !/\d/.test(createPassword)
    ) {
      setCreateFormError(
        'Password must be at least 8 characters and include at least one letter and one number.'
      );
      return;
    }

    let cleanedBusinessMobile = '';
    if (createRole === 'FARMER') {
      cleanedBusinessMobile = createFarmerBusinessMobile.replace(
        /[\s\-()]/g,
        ''
      );
      if (!/^[6-9]\d{9}$/.test(cleanedBusinessMobile)) {
        setCreateFormError(
          'Farmer business contact mobile number is required and must be a valid 10-digit Indian mobile number.'
        );
        return;
      }
    }

    let cleanedEmergencyMobile: string | undefined;
    if (
      createRole === 'GRAZING_WORKER' &&
      createGrazingEmergencyMobile.trim().length > 0
    ) {
      cleanedEmergencyMobile = createGrazingEmergencyMobile.replace(
        /[\s\-()]/g,
        ''
      );
      if (!/^[6-9]\d{9}$/.test(cleanedEmergencyMobile)) {
        setCreateFormError(
          'Emergency contact mobile must be a valid 10-digit Indian mobile number.'
        );
        return;
      }
    }

    setCreatingAccount(true);
    try {
      const created = await createAdminManagedAccountApi(accessToken, {
        role: createRole,
        fullName: createFullName.trim(),
        mobileNumber: cleanedLoginMobile,
        password: createPassword,
        ...(createRole === 'STAFF'
          ? { staffPermissions: createStaffPermissions }
          : {}),
        ...(createRole === 'FARMER'
          ? {
              farmerProfile: {
                businessContactMobile: cleanedBusinessMobile,
                villageOrLocation: createFarmerVillage.trim() || undefined,
                suppliedMilkTypes: createFarmerMilkTypes,
              },
            }
          : {}),
        ...(createRole === 'GRAZING_WORKER'
          ? {
              grazingWorkerProfile: {
                emergencyContactMobile: cleanedEmergencyMobile,
                assignedNotes: createGrazingNotes.trim() || undefined,
              },
            }
          : {}),
      });

      setFeedbackBanner({
        type: 'success',
        message: `Created ${getRoleDisplayLabel(created.role)} account ${created.userCode} (${created.fullName}).`,
      });

      // Reset form
      setCreateFullName('');
      setCreateMobileNumber('');
      setCreatePassword('');
      setCreateStaffPermissions([]);
      setCreateFarmerBusinessMobile('');
      setCreateFarmerVillage('');
      setCreateFarmerMilkTypes(['BUFFALO']);
      setCreateGrazingEmergencyMobile('');
      setCreateGrazingNotes('');
      setShowCreateForm(false);

      await loadAccountsAndLogs();
      await handleSelectAccount(created);
    } catch (err) {
      setCreateFormError(
        err instanceof Error ? err.message : 'Failed to create account.'
      );
    } finally {
      setCreatingAccount(false);
    }
  }

  async function handleSaveAccountEdits(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedAccount) return;

    setEditError(null);
    setFeedbackBanner(null);

    const cleanedLoginMobile = editMobileNumber.replace(/[\s\-()]/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanedLoginMobile)) {
      setEditError(
        'Login mobile number must be a valid 10-digit Indian mobile number.'
      );
      return;
    }

    let cleanedBusinessMobile = '';
    if (selectedAccount.role === 'FARMER') {
      cleanedBusinessMobile = editFarmerBusinessMobile.replace(
        /[\s\-()]/g,
        ''
      );
      if (!/^[6-9]\d{9}$/.test(cleanedBusinessMobile)) {
        setEditError(
          'Farmer business contact mobile must be a valid 10-digit Indian mobile number.'
        );
        return;
      }
    }

    setSavingEdit(true);
    try {
      const updated = await updateAdminManagedAccountApi(
        accessToken,
        selectedAccount.id,
        {
          fullName: editFullName.trim(),
          mobileNumber: cleanedLoginMobile,
          ...(editPassword.trim().length > 0
            ? { password: editPassword }
            : {}),
          ...(selectedAccount.role === 'STAFF'
            ? { staffPermissions: editStaffPermissions }
            : {}),
          ...(selectedAccount.role === 'FARMER'
            ? {
                farmerProfile: {
                  businessContactMobile: cleanedBusinessMobile,
                  villageOrLocation: editFarmerVillage.trim() || undefined,
                  suppliedMilkTypes: editFarmerMilkTypes,
                },
              }
            : {}),
          ...(selectedAccount.role === 'GRAZING_WORKER'
            ? {
                grazingWorkerProfile: {
                  emergencyContactMobile:
                    editGrazingEmergencyMobile.trim() || undefined,
                  assignedNotes: editGrazingNotes.trim() || undefined,
                },
              }
            : {}),
        }
      );

      setSelectedAccount(updated);
      populateEditForm(updated);
      setFeedbackBanner({
        type: 'success',
        message: `Updated account ${updated.userCode} (${updated.fullName}).`,
      });
      await loadAccountsAndLogs();
      const details = await fetchAdminAccountDetailsApi(
        accessToken,
        updated.id
      );
      setSelectedAccountLogs(details.auditLogs);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Failed to update account.'
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleStatusUpdate() {
    if (!selectedAccount) return;
    setEditError(null);
    setFeedbackBanner(null);
    setUpdatingStatus(true);

    try {
      const result = await updateAdminAccountStatusApi(
        accessToken,
        selectedAccount.id,
        {
          status: targetStatus,
          reason: statusReason.trim() || undefined,
        }
      );

      setSelectedAccount(result.account);
      populateEditForm(result.account);
      setFeedbackBanner({
        type: 'success',
        message: `Account ${result.account.userCode} status set to ${result.account.status}.${result.sessionRevoked ? ' All active sessions for this user have been immediately revoked.' : ''}`,
      });
      await loadAccountsAndLogs();
      const details = await fetchAdminAccountDetailsApi(
        accessToken,
        result.account.id
      );
      setSelectedAccountLogs(details.auditLogs);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Failed to update account status.'
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <section className="rounded-2xl border border-emerald-900/15 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-dairy-meadow px-3 py-1 text-xs font-semibold text-dairy-pasture">
                Phase 1 &bull; Step 2: Admin Account Management
              </span>
              {adminUser?.userCode && (
                <span className="rounded-md bg-slate-900 px-2.5 py-1 font-mono text-xs font-semibold text-white">
                  {adminUser.userCode}
                </span>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
              Account Provisioning &amp; Access Control
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Create and manage{' '}
              <span className="font-semibold text-slate-800">
                Staff (STF-XXXX)
              </span>
              ,{' '}
              <span className="font-semibold text-slate-800">
                Farmer / Milk Suppliers (FRM-XXXX)
              </span>
              , and{' '}
              <span className="font-semibold text-slate-800">
                Buffalo Grazing Workers (GRZ-XXXX)
              </span>{' '}
              with view-only staff permissions and instant session revocation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setShowCreateForm((prev) => !prev);
                setCreateFormError(null);
              }}
              className="rounded-xl bg-dairy-pasture px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-dairy-pastureDark"
            >
              {showCreateForm ? 'Close Creation Form' : '+ Create New Account'}
            </button>
            <button
              type="button"
              onClick={() => void loadAccountsAndLogs()}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Summary Metrics */}
        {metrics && (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Managed Operational Accounts
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {metrics.totalManaged}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Active: {metrics.byStatus.ACTIVE} &bull; Non-Active:{' '}
                {metrics.byStatus.INACTIVE +
                  metrics.byStatus.SUSPENDED +
                  metrics.byStatus.BLOCKED}
              </p>
            </div>

            <div className="rounded-xl border border-blue-200/80 bg-blue-50/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-800">
                  Staff
                </p>
                <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-blue-800">
                  STF-XXXX
                </span>
              </div>
              <p className="mt-1 text-2xl font-bold text-blue-950">
                {metrics.byRole.STAFF}
              </p>
              <p className="mt-0.5 text-xs text-blue-700">
                View-only custom permissions
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                  Farmers / Suppliers
                </p>
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-800">
                  FRM-XXXX
                </span>
              </div>
              <p className="mt-1 text-2xl font-bold text-emerald-950">
                {metrics.byRole.FARMER}
              </p>
              <p className="mt-0.5 text-xs text-emerald-700">
                Separate login &amp; business mobile
              </p>
            </div>

            <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                  Grazing Workers
                </p>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-800">
                  GRZ-XXXX
                </span>
              </div>
              <p className="mt-1 text-2xl font-bold text-amber-950">
                {metrics.byRole.GRAZING_WORKER}
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                Buffalo grazing attendance role
              </p>
            </div>
          </div>
        )}
      </section>

      {feedbackBanner && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium ${
            feedbackBanner.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-red-300 bg-red-50 text-red-900'
          }`}
        >
          <span>{feedbackBanner.message}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="ml-4 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Account Creation Form */}
      {showCreateForm && (
        <section className="rounded-2xl border border-emerald-900/20 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-col justify-between gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Create Managed Account
              </h2>
              <p className="text-xs text-slate-600">
                Select one of the three permitted operational roles. Admin
                accounts can only be provisioned manually by an authorized
                technical operator.
              </p>
            </div>
            <span className="rounded-lg bg-dairy-meadow px-3 py-1 font-mono text-xs font-semibold text-dairy-pasture">
              Auto Prefix:{' '}
              {createRole === 'STAFF'
                ? 'STF-XXXX'
                : createRole === 'FARMER'
                  ? 'FRM-XXXX'
                  : 'GRZ-XXXX'}
            </span>
          </div>

          {createFormError && (
            <div className="mb-6">
              <ErrorState
                title="Account Creation Error"
                message={createFormError}
              />
            </div>
          )}

          <form
            onSubmit={(e) => void handleCreateAccount(e)}
            className="space-y-6"
            noValidate
          >
            {/* Role Selector Cards */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                1. Choose Operational Role <span className="text-red-600">*</span>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(
                  [
                    {
                      role: 'STAFF' as ManagedUserRole,
                      title: 'Staff (STF-XXXX)',
                      subtitle: 'View-only operational access configured by Admin',
                    },
                    {
                      role: 'FARMER' as ManagedUserRole,
                      title: 'Farmer / Milk Supplier (FRM-XXXX)',
                      subtitle:
                        'Separate login mobile & business procurement contact mobile',
                    },
                    {
                      role: 'GRAZING_WORKER' as ManagedUserRole,
                      title: 'Buffalo Grazing Worker (GRZ-XXXX)',
                      subtitle: 'Field worker account for grazing attendance',
                    },
                  ] as const
                ).map((option) => {
                  const selected = createRole === option.role;
                  return (
                    <button
                      key={option.role}
                      type="button"
                      onClick={() => setCreateRole(option.role)}
                      className={`rounded-xl border p-4 text-left transition ${
                        selected
                          ? 'border-dairy-pasture bg-dairy-meadow/60 ring-2 ring-dairy-pasture/20'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <p className="text-sm font-bold text-slate-900">
                        {option.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {option.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Common Account Credentials */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="create-full-name"
                  className="block text-sm font-medium text-slate-800"
                >
                  Full Name <span className="text-red-600">*</span>
                </label>
                <input
                  id="create-full-name"
                  type="text"
                  required
                  value={createFullName}
                  onChange={(e) => setCreateFullName(e.target.value)}
                  placeholder="Enter full name"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
                />
              </div>

              <div>
                <label
                  htmlFor="create-login-mobile"
                  className="block text-sm font-medium text-slate-800"
                >
                  {createRole === 'FARMER'
                    ? 'Farmer Login Mobile Number'
                    : 'Login Mobile Number'}{' '}
                  <span className="text-red-600">*</span>
                </label>
                <input
                  id="create-login-mobile"
                  type="tel"
                  required
                  maxLength={10}
                  value={createMobileNumber}
                  onChange={(e) => setCreateMobileNumber(e.target.value)}
                  placeholder="10-digit login mobile"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Used for account sign-in authentication.
                </p>
              </div>

              <div>
                <label
                  htmlFor="create-password"
                  className="block text-sm font-medium text-slate-800"
                >
                  Initial Password <span className="text-red-600">*</span>
                </label>
                <input
                  id="create-password"
                  type="password"
                  required
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="Min 8 chars (letter + number)"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
                />
              </div>
            </div>

            {/* Role-Specific Fields: STAFF */}
            {createRole === 'STAFF' && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-blue-950">
                      Custom View-Only Staff Permissions
                    </h3>
                    <p className="text-xs text-blue-800">
                      Staff accounts are strictly view-only by default and can
                      never modify their own permissions or perform write
                      operations.
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-900">
                    {createStaffPermissions.length} Selected
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {ALL_STAFF_PERMISSIONS.map((perm) => {
                    const checked = createStaffPermissions.includes(perm);
                    const info = STAFF_PERMISSION_LABELS[perm];
                    return (
                      <label
                        key={perm}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-xs transition ${
                          checked
                            ? 'border-blue-600 bg-white shadow-sm'
                            : 'border-blue-200/70 bg-white/70 hover:bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setCreateStaffPermissions((prev) =>
                              togglePermissionInList(prev, perm)
                            )
                          }
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-dairy-pasture focus:ring-dairy-pasture"
                        />
                        <div>
                          <p className="font-semibold text-slate-900">
                            {info.label}
                          </p>
                          <p className="mt-0.5 text-slate-600">
                            {info.description}
                          </p>
                          <code className="mt-1 inline-block font-mono text-[10px] text-blue-700">
                            {perm}
                          </code>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Role-Specific Fields: FARMER */}
            {createRole === 'FARMER' && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-emerald-950">
                    Farmer / Milk Supplier Details
                  </h3>
                  <p className="text-xs text-emerald-800">
                    Farmer accounts maintain a separate{' '}
                    <strong>Business Contact Mobile Number</strong> for milk
                    collection and settlement communications, distinct from their{' '}
                    <strong>Login Mobile Number</strong>.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="create-farmer-business-mobile"
                      className="block text-sm font-medium text-slate-800"
                    >
                      Farmer Business Contact Mobile{' '}
                      <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="create-farmer-business-mobile"
                      type="tel"
                      required
                      maxLength={10}
                      value={createFarmerBusinessMobile}
                      onChange={(e) =>
                        setCreateFarmerBusinessMobile(e.target.value)
                      }
                      placeholder="10-digit business contact mobile"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
                    />
                    <p className="mt-1 text-[11px] text-emerald-800">
                      Stored separately from Login Mobile Number.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="create-farmer-village"
                      className="block text-sm font-medium text-slate-800"
                    >
                      Village / Collection Location
                    </label>
                    <input
                      id="create-farmer-village"
                      type="text"
                      value={createFarmerVillage}
                      onChange={(e) => setCreateFarmerVillage(e.target.value)}
                      placeholder="e.g., Chandragiri Mandal"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
                    />
                  </div>

                  <div>
                    <span className="block text-sm font-medium text-slate-800">
                      Supplied Milk Types
                    </span>
                    <div className="mt-2 flex items-center gap-4">
                      {(['BUFFALO', 'COW'] as const).map((milkType) => (
                        <label
                          key={milkType}
                          className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-800"
                        >
                          <input
                            type="checkbox"
                            checked={createFarmerMilkTypes.includes(milkType)}
                            onChange={() =>
                              setCreateFarmerMilkTypes((prev) =>
                                toggleMilkTypeInList(prev, milkType)
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300 text-dairy-pasture"
                          />
                          <span>
                            {milkType === 'BUFFALO'
                              ? 'Buffalo Milk'
                              : 'Cow Milk'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Role-Specific Fields: GRAZING_WORKER */}
            {createRole === 'GRAZING_WORKER' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-5">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-amber-950">
                    Buffalo Grazing Worker Details
                  </h3>
                  <p className="text-xs text-amber-800">
                    Optional emergency contact and herd assignment notes for
                    buffalo grazing operations.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="create-grazing-emergency"
                      className="block text-sm font-medium text-slate-800"
                    >
                      Emergency Contact Mobile Number
                    </label>
                    <input
                      id="create-grazing-emergency"
                      type="tel"
                      maxLength={10}
                      value={createGrazingEmergencyMobile}
                      onChange={(e) =>
                        setCreateGrazingEmergencyMobile(e.target.value)
                      }
                      placeholder="Optional 10-digit mobile"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="create-grazing-notes"
                      className="block text-sm font-medium text-slate-800"
                    >
                      Assigned Herd / Shift Notes
                    </label>
                    <input
                      id="create-grazing-notes"
                      type="text"
                      value={createGrazingNotes}
                      onChange={(e) => setCreateGrazingNotes(e.target.value)}
                      placeholder="e.g., Morning & evening pasture herd"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingAccount}
                className="rounded-lg bg-dairy-pasture px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-dairy-pastureDark disabled:opacity-60"
              >
                {creatingAccount
                  ? 'Creating Account...'
                  : `Create ${getRoleDisplayLabel(createRole)} Account`}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Main Content Grid: Account Directory & Selected Account Details/Edit */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Account Directory */}
        <div
          className={
            selectedAccount ? 'lg:col-span-7 space-y-4' : 'lg:col-span-12 space-y-4'
          }
        >
          <div className="rounded-2xl border border-emerald-900/15 bg-white p-6 shadow-sm">
            {/* Filters */}
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'ALL_MANAGED', label: 'All Managed Roles' },
                  { id: 'STAFF', label: 'Staff (STF)' },
                  { id: 'FARMER', label: 'Farmers (FRM)' },
                  { id: 'GRAZING_WORKER', label: 'Grazing Workers (GRZ)' },
                  { id: 'CUSTOMER', label: 'Customers (CUS)' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRoleFilter(tab.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      roleFilter === tab.id
                        ? 'bg-dairy-pasture text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, code (STF/FRM/GRZ), login mobile, or business mobile..."
                  className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-dairy-pasture focus:outline-none focus:ring-2 focus:ring-dairy-pasture/20"
                />

                <select
                  aria-label="Filter by account status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-dairy-pasture focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="BLOCKED">BLOCKED</option>
                </select>
              </div>
            </div>

            {/* Directory List */}
            <div className="mt-5">
              {loadingList ? (
                <LoadingState
                  title="Loading Accounts..."
                  message="Fetching accounts from Raithu Palu directory."
                />
              ) : listError ? (
                <ErrorState
                  title="Unable to Load Accounts"
                  message={listError}
                  onRetry={() => void loadAccountsAndLogs()}
                />
              ) : accounts.length === 0 ? (
                <EmptyState
                  title="No Matching Accounts Found"
                  message="No Staff, Farmer, or Buffalo Grazing Worker accounts match the selected filters. Click '+ Create New Account' above to add one."
                />
              ) : (
                <div className="divide-y divide-slate-200">
                  {accounts.map((acc) => {
                    const isSelected = selectedAccount?.id === acc.id;
                    return (
                      <div
                        key={acc.id}
                        className={`flex flex-col justify-between gap-4 py-4 transition sm:flex-row sm:items-center ${
                          isSelected
                            ? 'rounded-xl bg-dairy-meadow/40 px-3'
                            : 'hover:bg-slate-50/80 px-2'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
                              {acc.userCode ?? acc.id.slice(0, 8)}
                            </span>
                            <span className="text-base font-bold text-slate-900">
                              {acc.fullName}
                            </span>
                            <span
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getRoleBadgeStyle(
                                acc.role
                              )}`}
                            >
                              {getRoleDisplayLabel(acc.role)}
                            </span>
                            <span
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadgeStyle(
                                acc.status
                              )}`}
                            >
                              {acc.status}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                            <span>
                              Login Mobile:{' '}
                              <strong className="font-mono text-slate-800">
                                {acc.mobileNumber}
                              </strong>
                            </span>

                            {acc.role === 'FARMER' && acc.farmerProfile && (
                              <>
                                <span>
                                  Business Contact Mobile:{' '}
                                  <strong className="font-mono text-emerald-800">
                                    {acc.farmerProfile.businessContactMobile}
                                  </strong>
                                </span>
                                {acc.farmerProfile.villageOrLocation && (
                                  <span>
                                    Village:{' '}
                                    <strong>
                                      {acc.farmerProfile.villageOrLocation}
                                    </strong>
                                  </span>
                                )}
                              </>
                            )}

                            {acc.role === 'STAFF' && (
                              <span>
                                View Permissions:{' '}
                                <strong>
                                  {acc.staffPermissions?.length ?? 0} granted
                                </strong>
                              </span>
                            )}

                            {acc.role === 'GRAZING_WORKER' &&
                              acc.grazingWorkerProfile
                                ?.emergencyContactMobile && (
                                <span>
                                  Emergency Mobile:{' '}
                                  <strong className="font-mono">
                                    {
                                      acc.grazingWorkerProfile
                                        .emergencyContactMobile
                                    }
                                  </strong>
                                </span>
                              )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleSelectAccount(acc)}
                            className="rounded-lg border border-dairy-pasture/30 bg-white px-3.5 py-1.5 text-xs font-semibold text-dairy-pasture shadow-sm transition hover:bg-dairy-meadow"
                          >
                            {isSelected ? 'Viewing Details' : 'Manage / Edit'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent Account Management Audit Log */}
          <div className="rounded-2xl border border-emerald-900/15 bg-white p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">
              Recent Account Management Audit Trail
            </h2>
            <p className="text-xs text-slate-500">
              Immutable security log of Admin account creations, updates,
              permission changes, and status transitions.
            </p>

            {recentAuditLogs.length === 0 ? (
              <p className="mt-4 text-xs text-slate-500">
                No audit log entries recorded yet.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {recentAuditLogs.slice(0, 6).map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col justify-between gap-1 py-2.5 text-xs sm:flex-row sm:items-center"
                  >
                    <div>
                      <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                        {log.action}
                      </span>
                      <span className="text-slate-800">{log.summary}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Account Details, Editing & Status Management */}
        {selectedAccount && (
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-2xl border border-emerald-900/20 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
                      {selectedAccount.userCode}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getRoleBadgeStyle(
                        selectedAccount.role
                      )}`}
                    >
                      {getRoleDisplayLabel(selectedAccount.role)}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadgeStyle(
                        selectedAccount.status
                      )}`}
                    >
                      {selectedAccount.status}
                    </span>
                  </div>
                  <h2 className="mt-2 text-xl font-bold text-slate-900">
                    {selectedAccount.fullName}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedAccount(null)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Close
                </button>
              </div>

              {loadingDetails && (
                <p className="mt-3 text-xs text-slate-500">
                  Refreshing account details...
                </p>
              )}

              {editError && (
                <div className="mt-4">
                  <ErrorState title="Update Failed" message={editError} />
                </div>
              )}

              {/* Account Status & Session Revocation Section */}
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Account Status &amp; Session Control
                </h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  Setting an account to <strong>INACTIVE</strong>,{' '}
                  <strong>SUSPENDED</strong>, or <strong>BLOCKED</strong>{' '}
                  immediately revokes all active sessions and blocks future
                  authenticated requests on the backend.
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLOCKED'] as const
                  ).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setTargetStatus(st)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                        targetStatus === st
                          ? 'border-dairy-pasture bg-dairy-pasture text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <div className="mt-3">
                  <label
                    htmlFor="status-reason"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Status Change Reason (recorded in Audit Log)
                  </label>
                  <input
                    id="status-reason"
                    type="text"
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    placeholder="e.g., Seasonal pause, policy violation, or reactivated"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
                  />
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    disabled={updatingStatus}
                    onClick={() => void handleStatusUpdate()}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {updatingStatus
                      ? 'Updating Status...'
                      : `Apply Status (${targetStatus})`}
                  </button>
                </div>
              </div>

              {/* Edit Account Details Form */}
              <form
                onSubmit={(e) => void handleSaveAccountEdits(e)}
                className="mt-6 space-y-4"
                noValidate
              >
                <h3 className="text-sm font-bold text-slate-900">
                  Edit Account Information
                </h3>

                <div>
                  <label
                    htmlFor="edit-full-name"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Full Name
                  </label>
                  <input
                    id="edit-full-name"
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-login-mobile"
                    className="block text-xs font-medium text-slate-700"
                  >
                    {selectedAccount.role === 'FARMER'
                      ? 'Farmer Login Mobile Number (Authentication)'
                      : 'Login Mobile Number'}
                  </label>
                  <input
                    id="edit-login-mobile"
                    type="tel"
                    required
                    maxLength={10}
                    value={editMobileNumber}
                    onChange={(e) => setEditMobileNumber(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>

                {selectedAccount.role === 'FARMER' && (
                  <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                    <p className="text-xs font-bold text-emerald-950">
                      Farmer Business Contact &amp; Supply Details
                    </p>
                    <div>
                      <label
                        htmlFor="edit-farmer-business-mobile"
                        className="block text-xs font-medium text-slate-700"
                      >
                        Farmer Business Contact Mobile Number (Separate from
                        Login Mobile)
                      </label>
                      <input
                        id="edit-farmer-business-mobile"
                        type="tel"
                        required
                        maxLength={10}
                        value={editFarmerBusinessMobile}
                        onChange={(e) =>
                          setEditFarmerBusinessMobile(e.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="edit-farmer-village"
                        className="block text-xs font-medium text-slate-700"
                      >
                        Village / Collection Location
                      </label>
                      <input
                        id="edit-farmer-village"
                        type="text"
                        value={editFarmerVillage}
                        onChange={(e) => setEditFarmerVillage(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
                      />
                    </div>

                    <div>
                      <span className="block text-xs font-medium text-slate-700">
                        Supplied Milk Types
                      </span>
                      <div className="mt-1.5 flex items-center gap-4">
                        {(['BUFFALO', 'COW'] as const).map((milkType) => (
                          <label
                            key={milkType}
                            className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-800"
                          >
                            <input
                              type="checkbox"
                              checked={editFarmerMilkTypes.includes(milkType)}
                              onChange={() =>
                                setEditFarmerMilkTypes((prev) =>
                                  toggleMilkTypeInList(prev, milkType)
                                )
                              }
                              className="h-4 w-4 rounded border-slate-300 text-dairy-pasture"
                            />
                            <span>{milkType}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {selectedAccount.role === 'STAFF' && (
                  <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                    <p className="text-xs font-bold text-blue-950">
                      Admin-Configured View-Only Staff Permissions
                    </p>
                    <div className="space-y-2">
                      {ALL_STAFF_PERMISSIONS.map((perm) => {
                        const checked = editStaffPermissions.includes(perm);
                        const info = STAFF_PERMISSION_LABELS[perm];
                        return (
                          <label
                            key={perm}
                            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-blue-200/70 bg-white p-2.5 text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setEditStaffPermissions((prev) =>
                                  togglePermissionInList(prev, perm)
                                )
                              }
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-dairy-pasture"
                            />
                            <div>
                              <p className="font-semibold text-slate-900">
                                {info.label}
                              </p>
                              <p className="text-slate-600">
                                {info.description}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedAccount.role === 'GRAZING_WORKER' && (
                  <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                    <p className="text-xs font-bold text-amber-950">
                      Buffalo Grazing Worker Profile
                    </p>
                    <div>
                      <label
                        htmlFor="edit-grazing-emergency"
                        className="block text-xs font-medium text-slate-700"
                      >
                        Emergency Contact Mobile Number
                      </label>
                      <input
                        id="edit-grazing-emergency"
                        type="tel"
                        maxLength={10}
                        value={editGrazingEmergencyMobile}
                        onChange={(e) =>
                          setEditGrazingEmergencyMobile(e.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="edit-grazing-notes"
                        className="block text-xs font-medium text-slate-700"
                      >
                        Assigned Notes
                      </label>
                      <input
                        id="edit-grazing-notes"
                        type="text"
                        value={editGrazingNotes}
                        onChange={(e) => setEditGrazingNotes(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="edit-reset-password"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Reset Password (Optional — leave blank to keep current)
                  </label>
                  <input
                    id="edit-reset-password"
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="New password (min 8 chars, letter + number)"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="w-full rounded-lg bg-dairy-pasture px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-dairy-pastureDark disabled:opacity-60"
                  >
                    {savingEdit
                      ? 'Saving Changes...'
                      : 'Save Account Changes'}
                  </button>
                </div>
              </form>

              {/* Selected Account Audit History */}
              <div className="mt-6 border-t border-slate-200 pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Account Audit History ({selectedAccountLogs.length})
                </h3>
                {selectedAccountLogs.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    No audit entries for this account yet.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedAccountLogs.slice(0, 5).map((log) => (
                      <div
                        key={log.id}
                        className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold text-dairy-pasture">
                            {log.action}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-slate-700">{log.summary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
