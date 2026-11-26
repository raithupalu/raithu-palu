import { buildApiUrl } from './apiConfig';
import { buildAuthHeaders, type CustomerProfile, ApiRequestError } from './authApi';

export interface DeliveryAddress {
  addressId: string;
  label: 'HOME'|'OFFICE'|'OTHER';
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
  monday: { quantityLitres:number };
  tuesday: { quantityLitres:number };
  wednesday: { quantityLitres:number };
  thursday: { quantityLitres:number };
  friday: { quantityLitres:number };
  saturday: { quantityLitres:number };
  sunday: { quantityLitres:number };
  status: 'ACTIVE'|'INACTIVE'|'PAUSED';
  pausedUntil?: string | null;
  effectiveFrom?: string;
}

export interface CustomerDetail extends CustomerProfile {
  deliveryAddresses: DeliveryAddress[];
  activeDeliveryAddressId: string | null;
  milkServiceStatus: 'PENDING_ACTIVATION'|'ACTIVE'|'PAUSED'|'STOPPED' | null;
  productOrderServiceStatus: 'ACTIVE'|'PAUSED'|'STOPPED' | null;
  weeklyMilkSchedule: WeeklyMilkSchedule | null;
  tags: string[];
  mustChangePassword: boolean;
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  let payload: Record<string, unknown> = {};
  try { payload = await response.json() as Record<string, unknown>; } catch {}
  if (!response.ok) {
    const code = typeof payload.code === 'string' ? payload.code : 'REQUEST_FAILED';
    const message = typeof payload.message === 'string' ? payload.message : `Request failed ${response.status}`;
    const err = new ApiRequestError(response.status, code, message);
    // attach extra details
    (err as unknown as Record<string,unknown>).details = (payload as Record<string,unknown>).details;
    (err as unknown as Record<string,unknown>).errors = (payload as Record<string,unknown>).errors;
    throw err;
  }
  return payload as T;
}

export async function listCustomersApi(accessToken: string|null, params: Record<string,string|undefined>={}): Promise<{ customers: CustomerDetail[]; total:number; page:number; pageSize:number }>{
  const search = new URLSearchParams();
  for (const [k,v] of Object.entries(params)) if (v) search.set(k, v);
  const qs = search.toString() ? `?${search.toString()}` : '';
  const res = await fetch(buildApiUrl(`/admin/customers${qs}`), { method:'GET', headers: buildAuthHeaders(accessToken,false), credentials:'include' });
  const result = await parseJsonOrThrow<{ data:{ customers:CustomerDetail[]; total:number; page:number; pageSize:number } }>(res);
  return result.data;
}

export async function getCustomerDetailApi(accessToken:string|null, id:string): Promise<CustomerDetail>{
  const res = await fetch(buildApiUrl(`/admin/customers/${encodeURIComponent(id)}`), { method:'GET', headers: buildAuthHeaders(accessToken,false), credentials:'include' });
  const result = await parseJsonOrThrow<{ data:{ customer:CustomerDetail } }>(res);
  return result.data.customer;
}

export async function createCustomerAdminApi(accessToken:string|null, payload: Record<string,unknown>): Promise<CustomerDetail>{
  const res = await fetch(buildApiUrl('/admin/customers'), { method:'POST', headers: buildAuthHeaders(accessToken,true), credentials:'include', body: JSON.stringify(payload) });
  const result = await parseJsonOrThrow<{ data:{ customer:CustomerDetail } }>(res);
  return result.data.customer;
}

export async function updateCustomerAdminApi(accessToken:string|null, id:string, payload: Record<string,unknown>): Promise<CustomerDetail>{
  const res = await fetch(buildApiUrl(`/admin/customers/${encodeURIComponent(id)}`), { method:'PATCH', headers: buildAuthHeaders(accessToken,true), credentials:'include', body: JSON.stringify(payload) });
  const result = await parseJsonOrThrow<{ data:{ customer:CustomerDetail } }>(res);
  return result.data.customer;
}

export async function updateCustomerStatusApi(accessToken:string|null, id:string, payload: { status:string; reason?:string }): Promise<{ account:CustomerDetail; sessionRevoked:boolean }>{
  const res = await fetch(buildApiUrl(`/admin/customers/${encodeURIComponent(id)}/status`), { method:'PATCH', headers: buildAuthHeaders(accessToken,true), credentials:'include', body: JSON.stringify(payload) });
  const result = await parseJsonOrThrow<{ data: { account:CustomerDetail; sessionRevoked:boolean } }>(res);
  return result.data;
}

export async function updateMilkServiceStatusApi(accessToken:string|null, id:string, payload:{ status:string; reason?:string }): Promise<CustomerDetail>{
  const res = await fetch(buildApiUrl(`/admin/customers/${encodeURIComponent(id)}/milk-service-status`), { method:'PATCH', headers: buildAuthHeaders(accessToken,true), credentials:'include', body: JSON.stringify(payload) });
  const result = await parseJsonOrThrow<{ data:{ customer:CustomerDetail } }>(res);
  return result.data.customer;
}

export async function updateProductOrderServiceStatusApi(accessToken:string|null, id:string, payload:{ status:string; reason?:string }): Promise<CustomerDetail>{
  const res = await fetch(buildApiUrl(`/admin/customers/${encodeURIComponent(id)}/product-order-service-status`), { method:'PATCH', headers: buildAuthHeaders(accessToken,true), credentials:'include', body: JSON.stringify(payload) });
  const result = await parseJsonOrThrow<{ data:{ customer:CustomerDetail } }>(res);
  return result.data.customer;
}

export async function updateWeeklyScheduleApi(accessToken:string|null, id:string, payload: Record<string,unknown>): Promise<CustomerDetail>{
  const res = await fetch(buildApiUrl(`/admin/customers/${encodeURIComponent(id)}/weekly-schedule`), { method:'PATCH', headers: buildAuthHeaders(accessToken,true), credentials:'include', body: JSON.stringify(payload) });
  const result = await parseJsonOrThrow<{ data:{ customer:CustomerDetail } }>(res);
  return result.data.customer;
}

export async function getTimelineApi(accessToken:string|null, id:string, page=1, limit=20): Promise<{ entries:unknown[]; total:number }>{
  const res = await fetch(buildApiUrl(`/admin/customers/${encodeURIComponent(id)}/timeline?page=${page}&limit=${limit}`), { method:'GET', headers: buildAuthHeaders(accessToken,false), credentials:'include' });
  const result = await parseJsonOrThrow<{ data:{ entries:unknown[]; total:number } }>(res);
  return result.data;
}

export async function createNoteApi(accessToken:string|null, id:string, body:string): Promise<unknown>{
  const res = await fetch(buildApiUrl(`/admin/customers/${encodeURIComponent(id)}/notes`), { method:'POST', headers: buildAuthHeaders(accessToken,true), credentials:'include', body: JSON.stringify({ body }) });
  const result = await parseJsonOrThrow<{ data:{ note:unknown } }>(res);
  return result.data.note;
}

export async function listNotesApi(accessToken:string|null, id:string): Promise<{ notes:unknown[]; total:number }>{
  const res = await fetch(buildApiUrl(`/admin/customers/${encodeURIComponent(id)}/notes`), { method:'GET', headers: buildAuthHeaders(accessToken,false), credentials:'include' });
  const result = await parseJsonOrThrow<{ data:{ notes:unknown[]; total:number } }>(res);
  return result.data;
}

export async function bulkImportApi(accessToken:string|null, file:File, dryRun=false): Promise<{ imported:number; customers:CustomerDetail[]; dryRun?:boolean; preview?:unknown[] }>{
  const form = new FormData();
  form.append('file', file);
  const headers = buildAuthHeaders(accessToken,false) as Record<string,string>;
  // Don't set Content-Type for FormData
  const res = await fetch(buildApiUrl(`/admin/customers/bulk-import${dryRun?'?dryRun=true':''}`), { method:'POST', headers, credentials:'include', body: form });
  const result = await parseJsonOrThrow<{ data:{ imported:number; customers:CustomerDetail[]; dryRun?:boolean; preview?:unknown[] } }>(res);
  return result.data;
}

export async function adminAddAddressApi(accessToken:string|null, id:string, payload: Record<string,unknown>): Promise<CustomerDetail>{
  const res = await fetch(buildApiUrl(`/admin/customers/${encodeURIComponent(id)}/addresses`), { method:'POST', headers: buildAuthHeaders(accessToken,true), credentials:'include', body: JSON.stringify(payload) });
  const result = await parseJsonOrThrow<{ data:{ customer:CustomerDetail } }>(res);
  return result.data.customer;
}

export async function adminActivateAddressApi(accessToken:string|null, id:string, addressId:string): Promise<CustomerDetail>{
  const res = await fetch(buildApiUrl(`/admin/customers/${encodeURIComponent(id)}/addresses/${encodeURIComponent(addressId)}/activate`), { method:'POST', headers: buildAuthHeaders(accessToken,false), credentials:'include' });
  const result = await parseJsonOrThrow<{ data:{ customer:CustomerDetail } }>(res);
  return result.data.customer;
}

export async function adminArchiveAddressApi(accessToken:string|null, id:string, addressId:string): Promise<CustomerDetail>{
  const res = await fetch(buildApiUrl(`/admin/customers/${encodeURIComponent(id)}/addresses/${encodeURIComponent(addressId)}/archive`), { method:'POST', headers: buildAuthHeaders(accessToken,false), credentials:'include' });
  const result = await parseJsonOrThrow<{ data:{ customer:CustomerDetail } }>(res);
  return result.data.customer;
}

// Customer self-service
export async function customerAddAddressApi(accessToken:string|null, payload: Record<string,unknown>): Promise<CustomerProfile>{
  const res = await fetch(buildApiUrl('/customer/addresses'), { method:'POST', headers: buildAuthHeaders(accessToken,true), credentials:'include', body: JSON.stringify(payload) });
  const result = await parseJsonOrThrow<{ data:{ profile:CustomerProfile } }>(res);
  return result.data.profile;
}
export async function customerActivateAddressApi(accessToken:string|null, addressId:string): Promise<CustomerProfile>{
  const res = await fetch(buildApiUrl(`/customer/addresses/${encodeURIComponent(addressId)}/activate`), { method:'POST', headers: buildAuthHeaders(accessToken,false), credentials:'include' });
  const result = await parseJsonOrThrow<{ data:{ profile:CustomerProfile } }>(res);
  return result.data.profile;
}
export async function customerArchiveAddressApi(accessToken:string|null, addressId:string): Promise<CustomerProfile>{
  const res = await fetch(buildApiUrl(`/customer/addresses/${encodeURIComponent(addressId)}/archive`), { method:'POST', headers: buildAuthHeaders(accessToken,false), credentials:'include' });
  const result = await parseJsonOrThrow<{ data:{ profile:CustomerProfile } }>(res);
  return result.data.profile;
}
export async function changePasswordApi(accessToken:string|null, payload:{ currentPassword:string; newPassword:string }): Promise<unknown>{
  const res = await fetch(buildApiUrl('/auth/change-password'), { method:'POST', headers: buildAuthHeaders(accessToken,true), credentials:'include', body: JSON.stringify(payload) });
  const result = await parseJsonOrThrow<Record<string,unknown>>(res);
  return result;
}
