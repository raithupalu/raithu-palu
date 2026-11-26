import { buildApiUrl } from './apiConfig';

export type UserRole =
  | 'ADMIN'
  | 'CUSTOMER'
  | 'STAFF'
  | 'FARMER'
  | 'GRAZING_WORKER';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface CustomerAddress {
  line1?: string;
  line2?: string;
  landmark?: string;
  city?: string;
  pincode?: string;
  deliveryNotes?: string;
}

export interface CustomerProfile {
  id: string;
  fullName: string;
  mobileNumber: string;
  role: UserRole;
  status: UserStatus;
  address?: CustomerAddress;
  lastLoginAt: string | null;
  lastLogoutAt: string | null;
  createdAt: string;
  updatedAt: string;
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
