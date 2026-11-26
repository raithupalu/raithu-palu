import { buildApiUrl } from './apiConfig';

export type UserRole =
  | 'ADMIN'
  | 'CUSTOMER'
  | 'STAFF'
  | 'FARMER'
  | 'GRAZING_WORKER';

export type ManagedUserRole = 'STAFF' | 'FARMER' | 'GRAZING_WORKER';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'BLOCKED';

export type StaffPermission =
  | 'VIEW_CUSTOMERS'
  | 'VIEW_DAILY_DELIVERIES'
  | 'VIEW_BILLING'
  | 'VIEW_PRODUCT_ORDERS'
  | 'VIEW_FARMER_SUPPLY'
  | 'VIEW_GRAZING_ATTENDANCE';

export type MilkType = 'BUFFALO' | 'COW';

export interface CustomerAddress {
  line1?: string;
  line2?: string;
  landmark?: string;
  city?: string;
  pincode?: string;
  deliveryNotes?: string;
}

export interface FarmerProfile {
  businessContactMobile: string;
  villageOrLocation?: string;
  suppliedMilkTypes: MilkType[];
}

export interface GrazingWorkerProfile {
  emergencyContactMobile?: string;
  assignedNotes?: string;
}

export interface DeliveryAddress {
  addressId: string;
  label: 'HOME' | 'OFFICE' | 'OTHER';
  line1: string;
  line2?: string;
  landmark?: string;
  city?: string;
  pincode: string;
  deliveryNotes?: string;
  isArchived: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WeeklyMilkSchedule {
  scheduleId: string;
  monday: { quantityLitres: number };
  tuesday: { quantityLitres: number };
  wednesday: { quantityLitres: number };
  thursday: { quantityLitres: number };
  friday: { quantityLitres: number };
  saturday: { quantityLitres: number };
  sunday: { quantityLitres: number };
  status: 'ACTIVE' | 'INACTIVE' | 'PAUSED';
  pausedUntil?: string | null;
  effectiveFrom?: string;
}

export interface CustomerProfile {
  id: string;
  userCode?: string;
  fullName: string;
  mobileNumber: string;
  role: UserRole;
  status: UserStatus;
  statusReason?: string;
  address?: CustomerAddress;
  deliveryAddresses?: DeliveryAddress[];
  activeDeliveryAddressId?: string | null;
  milkServiceStatus?: 'PENDING_ACTIVATION' | 'ACTIVE' | 'PAUSED' | 'STOPPED' | null;
  productOrderServiceStatus?: 'ACTIVE' | 'PAUSED' | 'STOPPED' | null;
  weeklyMilkSchedule?: WeeklyMilkSchedule | null;
  tags?: string[];
  mustChangePassword?: boolean;
  staffPermissions?: StaffPermission[];
  farmerProfile?: FarmerProfile;
  grazingWorkerProfile?: GrazingWorkerProfile;
  createdBy?: string | null;
  lastLoginAt: string | null;
  lastLogoutAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type UserProfile = CustomerProfile;

export interface AuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  actorRole: string;
  targetUserId: string;
  targetUserCode: string;
  targetRole: UserRole;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AccountSummaryMetrics {
  totalManaged: number;
  byRole: {
    STAFF: number;
    FARMER: number;
    GRAZING_WORKER: number;
    CUSTOMER: number;
    ADMIN: number;
  };
  byStatus: {
    ACTIVE: number;
    INACTIVE: number;
    SUSPENDED: number;
    BLOCKED: number;
  };
}

export interface AuthSuccessPayload {
  status: string;
  message: string;
  data: {
    user: CustomerProfile;
    accessToken: string;
    expiresIn: string;
  };
}

export interface RegisterCustomerPayload {
  fullName: string;
  mobileNumber: string;
  password: string;
  address?: CustomerAddress;
}

export interface LoginCustomerPayload {
  mobileNumber: string;
  password: string;
}

export interface UpdateProfilePayload {
  fullName?: string;
  address?: CustomerAddress;
}

export interface CreateManagedAccountPayload {
  role: ManagedUserRole;
  fullName: string;
  mobileNumber: string;
  password: string;
  status?: UserStatus;
  staffPermissions?: StaffPermission[];
  farmerProfile?: FarmerProfile;
  grazingWorkerProfile?: GrazingWorkerProfile;
}

export interface UpdateManagedAccountPayload {
  fullName?: string;
  mobileNumber?: string;
  password?: string;
  staffPermissions?: StaffPermission[];
  farmerProfile?: FarmerProfile;
  grazingWorkerProfile?: GrazingWorkerProfile;
}

export class ApiRequestError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, ApiRequestError.prototype);
  }
}

export function isPlausibleJwt(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim().replace(/^["']+|["']+$/g, '').trim();
  if (
    !trimmed ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed === '[object Object]'
  ) {
    return false;
  }
  const parts = trimmed.split('.');
  return parts.length === 3 && parts.every((segment) => segment.length > 0);
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON response
  }

  if (!response.ok) {
    const code =
      typeof payload.code === 'string' ? payload.code : 'REQUEST_FAILED';
    const message =
      typeof payload.message === 'string'
        ? payload.message
        : `Request failed with HTTP ${response.status}`;
    throw new ApiRequestError(response.status, code, message);
  }

  return payload as T;
}

export function buildAuthHeaders(
  accessToken: string | null,
  hasJsonBody = false
): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (hasJsonBody) {
    headers['Content-Type'] = 'application/json';
  }
  if (isPlausibleJwt(accessToken)) {
    const cleanToken = accessToken.trim().replace(/^["']+|["']+$/g, '').trim();
    headers.Authorization = `Bearer ${cleanToken}`;
  }
  return headers;
}

function normalizeAuthSuccessPayload(
  raw: Record<string, unknown>
): AuthSuccessPayload {
  const nestedData =
    raw.data && typeof raw.data === 'object'
      ? (raw.data as Record<string, unknown>)
      : {};

  const candidateToken = nestedData.accessToken ?? raw.accessToken;
  const candidateUser = (nestedData.user ?? raw.user) as
    | CustomerProfile
    | undefined;
  const expiresIn =
    typeof nestedData.expiresIn === 'string'
      ? nestedData.expiresIn
      : typeof raw.expiresIn === 'string'
        ? raw.expiresIn
        : '7d';

  if (!isPlausibleJwt(candidateToken) || !candidateUser) {
    throw new ApiRequestError(
      500,
      'INVALID_AUTH_RESPONSE',
      'Authentication server did not return a valid session token.'
    );
  }

  return {
    status: typeof raw.status === 'string' ? raw.status : 'ok',
    message: typeof raw.message === 'string' ? raw.message : 'Authenticated',
    data: {
      user: candidateUser,
      accessToken: candidateToken.trim(),
      expiresIn,
    },
  };
}

export async function registerCustomerApi(
  input: RegisterCustomerPayload
): Promise<AuthSuccessPayload> {
  const response = await fetch(buildApiUrl('/auth/customer/register'), {
    method: 'POST',
    headers: buildAuthHeaders(null, true),
    credentials: 'include',
    body: JSON.stringify(input),
  });

  const raw = await parseJsonOrThrow<Record<string, unknown>>(response);
  return normalizeAuthSuccessPayload(raw);
}

export async function loginCustomerApi(
  input: LoginCustomerPayload
): Promise<AuthSuccessPayload> {
  const response = await fetch(buildApiUrl('/auth/customer/login'), {
    method: 'POST',
    headers: buildAuthHeaders(null, true),
    credentials: 'include',
    body: JSON.stringify(input),
  });

  const raw = await parseJsonOrThrow<Record<string, unknown>>(response);
  return normalizeAuthSuccessPayload(raw);
}

export async function loginAdminApi(
  input: LoginCustomerPayload
): Promise<AuthSuccessPayload> {
  const response = await fetch(buildApiUrl('/auth/admin/login'), {
    method: 'POST',
    headers: buildAuthHeaders(null, true),
    credentials: 'include',
    body: JSON.stringify(input),
  });

  const raw = await parseJsonOrThrow<Record<string, unknown>>(response);
  return normalizeAuthSuccessPayload(raw);
}

export async function loginUnifiedApi(
  input: LoginCustomerPayload
): Promise<AuthSuccessPayload> {
  const response = await fetch(buildApiUrl('/auth/login'), {
    method: 'POST',
    headers: buildAuthHeaders(null, true),
    credentials: 'include',
    body: JSON.stringify(input),
  });

  const raw = await parseJsonOrThrow<Record<string, unknown>>(response);
  return normalizeAuthSuccessPayload(raw);
}

export async function logoutCustomerApi(
  accessToken: string | null
): Promise<void> {
  const response = await fetch(buildApiUrl('/auth/logout'), {
    method: 'POST',
    headers: buildAuthHeaders(accessToken, false),
    credentials: 'include',
  });

  await parseJsonOrThrow<Record<string, unknown>>(response);
}

export async function fetchSessionUserApi(
  accessToken: string | null
): Promise<CustomerProfile> {
  const response = await fetch(buildApiUrl('/auth/me'), {
    method: 'GET',
    headers: buildAuthHeaders(accessToken, false),
    credentials: 'include',
  });

  const result = await parseJsonOrThrow<{
    status: string;
    user?: CustomerProfile;
    data?: { user?: CustomerProfile; profile?: CustomerProfile };
  }>(response);

  const user = result.data?.user ?? result.data?.profile ?? result.user;
  if (!user) {
    throw new ApiRequestError(
      500,
      'INVALID_SESSION_RESPONSE',
      'User payload missing from session response.'
    );
  }

  return user;
}

export async function fetchCustomerProfileApi(
  accessToken: string | null
): Promise<CustomerProfile> {
  const response = await fetch(buildApiUrl('/customer/profile'), {
    method: 'GET',
    headers: buildAuthHeaders(accessToken, false),
    credentials: 'include',
  });

  const result = await parseJsonOrThrow<{
    status: string;
    profile?: CustomerProfile;
    data?: { profile?: CustomerProfile; user?: CustomerProfile };
  }>(response);

  const profile =
    result.data?.profile ?? result.data?.user ?? result.profile;
  if (!profile) {
    throw new ApiRequestError(
      500,
      'INVALID_PROFILE_RESPONSE',
      'Profile payload missing from server response.'
    );
  }

  return profile;
}

export async function updateCustomerProfileApi(
  accessToken: string | null,
  input: UpdateProfilePayload
): Promise<CustomerProfile> {
  const response = await fetch(buildApiUrl('/customer/profile'), {
    method: 'PATCH',
    headers: buildAuthHeaders(accessToken, true),
    credentials: 'include',
    body: JSON.stringify(input),
  });

  const result = await parseJsonOrThrow<{
    status: string;
    profile?: CustomerProfile;
    data?: { profile?: CustomerProfile };
  }>(response);

  const profile = result.data?.profile ?? result.profile;
  if (!profile) {
    throw new ApiRequestError(
      500,
      'INVALID_PROFILE_RESPONSE',
      'Updated profile payload missing from server response.'
    );
  }

  return profile;
}

export async function fetchAdminAccountsApi(
  accessToken: string | null,
  filter: {
    role?: string;
    status?: string;
    search?: string;
  } = {}
): Promise<{
  accounts: UserProfile[];
  metrics: AccountSummaryMetrics;
  approvedStaffPermissions: StaffPermission[];
}> {
  const params = new URLSearchParams();
  if (filter.role) params.set('role', filter.role);
  if (filter.status) params.set('status', filter.status);
  if (filter.search) params.set('search', filter.search);
  const queryString = params.toString() ? `?${params.toString()}` : '';

  const response = await fetch(buildApiUrl(`/admin/accounts${queryString}`), {
    method: 'GET',
    headers: buildAuthHeaders(accessToken, false),
    credentials: 'include',
  });

  const result = await parseJsonOrThrow<{
    status: string;
    data: {
      accounts: UserProfile[];
      metrics: AccountSummaryMetrics;
      approvedStaffPermissions: StaffPermission[];
    };
  }>(response);

  return result.data;
}

export async function fetchAdminAccountDetailsApi(
  accessToken: string | null,
  accountId: string
): Promise<{
  account: UserProfile;
  auditLogs: AuditLogEntry[];
}> {
  const response = await fetch(
    buildApiUrl(`/admin/accounts/${encodeURIComponent(accountId)}`),
    {
      method: 'GET',
      headers: buildAuthHeaders(accessToken, false),
      credentials: 'include',
    }
  );

  const result = await parseJsonOrThrow<{
    status: string;
    data: {
      account: UserProfile;
      auditLogs: AuditLogEntry[];
    };
  }>(response);

  return result.data;
}

export async function createAdminManagedAccountApi(
  accessToken: string | null,
  payload: CreateManagedAccountPayload
): Promise<UserProfile> {
  const response = await fetch(buildApiUrl('/admin/accounts'), {
    method: 'POST',
    headers: buildAuthHeaders(accessToken, true),
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const result = await parseJsonOrThrow<{
    status: string;
    message: string;
    data: { account: UserProfile };
  }>(response);

  return result.data.account;
}

export async function updateAdminManagedAccountApi(
  accessToken: string | null,
  accountId: string,
  payload: UpdateManagedAccountPayload
): Promise<UserProfile> {
  const response = await fetch(
    buildApiUrl(`/admin/accounts/${encodeURIComponent(accountId)}`),
    {
      method: 'PATCH',
      headers: buildAuthHeaders(accessToken, true),
      credentials: 'include',
      body: JSON.stringify(payload),
    }
  );

  const result = await parseJsonOrThrow<{
    status: string;
    message: string;
    data: { account: UserProfile };
  }>(response);

  return result.data.account;
}

export async function updateAdminAccountStatusApi(
  accessToken: string | null,
  accountId: string,
  payload: { status: UserStatus; reason?: string }
): Promise<{ account: UserProfile; sessionRevoked: boolean }> {
  const response = await fetch(
    buildApiUrl(`/admin/accounts/${encodeURIComponent(accountId)}/status`),
    {
      method: 'PATCH',
      headers: buildAuthHeaders(accessToken, true),
      credentials: 'include',
      body: JSON.stringify(payload),
    }
  );

  const result = await parseJsonOrThrow<{
    status: string;
    message: string;
    data: { account: UserProfile; sessionRevoked: boolean };
  }>(response);

  return result.data;
}

export async function fetchAdminAuditLogsApi(
  accessToken: string | null,
  limit = 25
): Promise<AuditLogEntry[]> {
  const response = await fetch(
    buildApiUrl(`/admin/audit-logs?limit=${limit}`),
    {
      method: 'GET',
      headers: buildAuthHeaders(accessToken, false),
      credentials: 'include',
    }
  );

  const result = await parseJsonOrThrow<{
    status: string;
    data: { auditLogs: AuditLogEntry[] };
  }>(response);

  return result.data.auditLogs;
}
