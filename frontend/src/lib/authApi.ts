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
  }
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

function buildAuthHeaders(accessToken: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

export async function registerCustomerApi(
  input: RegisterCustomerPayload
): Promise<AuthSuccessPayload> {
  const response = await fetch(buildApiUrl('/auth/customer/register'), {
    method: 'POST',
    headers: buildAuthHeaders(null),
    credentials: 'include',
    body: JSON.stringify(input),
  });

  return parseJsonOrThrow<AuthSuccessPayload>(response);
}

export async function loginCustomerApi(
  input: LoginCustomerPayload
): Promise<AuthSuccessPayload> {
  const response = await fetch(buildApiUrl('/auth/customer/login'), {
    method: 'POST',
    headers: buildAuthHeaders(null),
    credentials: 'include',
    body: JSON.stringify(input),
  });

  return parseJsonOrThrow<AuthSuccessPayload>(response);
}

export async function logoutCustomerApi(
  accessToken: string | null
): Promise<void> {
  const response = await fetch(buildApiUrl('/auth/logout'), {
    method: 'POST',
    headers: buildAuthHeaders(accessToken),
    credentials: 'include',
  });

  await parseJsonOrThrow<Record<string, unknown>>(response);
}

export async function fetchCustomerProfileApi(
  accessToken: string | null
): Promise<CustomerProfile> {
  const response = await fetch(buildApiUrl('/customer/profile'), {
    method: 'GET',
    headers: buildAuthHeaders(accessToken),
    credentials: 'include',
  });

  const result = await parseJsonOrThrow<{
    status: string;
    data: { profile: CustomerProfile };
  }>(response);

  return result.data.profile;
}

export async function updateCustomerProfileApi(
  accessToken: string | null,
  input: UpdateProfilePayload
): Promise<CustomerProfile> {
  const response = await fetch(buildApiUrl('/customer/profile'), {
    method: 'PATCH',
    headers: buildAuthHeaders(accessToken),
    credentials: 'include',
    body: JSON.stringify(input),
  });

  const result = await parseJsonOrThrow<{
    status: string;
    data: { profile: CustomerProfile };
  }>(response);

  return result.data.profile;
}
