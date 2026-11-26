import { AppError } from '../middleware/notFound';
import {
  CustomerAddress,
  DeliveryAddress,
  DeliveryAddressLabel,
  VALID_DELIVERY_ADDRESS_LABELS,
  WeeklyMilkSchedule,
  WeeklyScheduleStatus,
  VALID_WEEKLY_SCHEDULE_STATUSES,
  MilkServiceStatus,
  VALID_MILK_SERVICE_STATUSES,
  ProductOrderServiceStatus,
  VALID_PRODUCT_ORDER_SERVICE_STATUSES,
  ManagedUserRole,
  UserStatus,
  VALID_USER_STATUSES,
  StaffPermission,
  APPROVED_STAFF_PERMISSIONS,
  FarmerProfile,
  GrazingWorkerProfile,
  MilkType,
} from '../models/User';

const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;
const PINCODE_REGEX = /^\d{6}$/;

const PERMITTED_MANAGED_ROLES: readonly ManagedUserRole[] = [
  'STAFF',
  'FARMER',
  'GRAZING_WORKER',
];

export function normalizeAndValidateMobileNumber(
  rawMobile: unknown,
  fieldLabel = 'Mobile number'
): string {
  if (typeof rawMobile !== 'string') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${fieldLabel} is required and must be a string.`
    );
  }

  let cleaned = rawMobile.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+91') && cleaned.length === 13) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  if (!INDIAN_MOBILE_REGEX.test(cleaned)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${fieldLabel} must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.`
    );
  }

  return cleaned;
}

export function validateFullName(rawName: unknown): string {
  if (typeof rawName !== 'string') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Full name is required and must be a string.'
    );
  }

  const trimmed = rawName.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2 || trimmed.length > 100) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Full name must be between 2 and 100 characters.'
    );
  }

  return trimmed;
}

export function validatePasswordStrength(rawPassword: unknown): string {
  if (typeof rawPassword !== 'string') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Password is required and must be a string.'
    );
  }

  if (rawPassword.length < 8 || rawPassword.length > 128) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Password must be between 8 and 128 characters long.'
    );
  }

  const hasLetter = /[A-Za-z]/.test(rawPassword);
  const hasDigit = /\d/.test(rawPassword);
  if (!hasLetter || !hasDigit) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Password must contain at least one letter and one number.'
    );
  }

  return rawPassword;
}

export function validateManagedRole(rawRole: unknown): ManagedUserRole {
  if (typeof rawRole !== 'string') {
    throw new AppError(
      400,
      'INVALID_ROLE',
      'Account role is required and must be one of STAFF, FARMER, or GRAZING_WORKER.'
    );
  }

  const normalized = rawRole.trim().toUpperCase();
  if (normalized === 'ADMIN') {
    throw new AppError(
      403,
      'INVALID_ROLE',
      'Admin accounts cannot be created through account management APIs. Admin accounts must be provisioned manually by an authorized technical operator.'
    );
  }

  if (!PERMITTED_MANAGED_ROLES.includes(normalized as ManagedUserRole)) {
    throw new AppError(
      400,
      'INVALID_ROLE',
      `Invalid role "${rawRole}". Admin account management supports STAFF, FARMER, and GRAZING_WORKER only.`
    );
  }

  return normalized as ManagedUserRole;
}

export function validateAccountStatus(rawStatus: unknown): UserStatus {
  if (typeof rawStatus !== 'string') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Account status is required and must be one of ACTIVE, INACTIVE, SUSPENDED, or BLOCKED.'
    );
  }

  const normalized = rawStatus.trim().toUpperCase();
  if (!VALID_USER_STATUSES.includes(normalized as UserStatus)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Invalid status "${rawStatus}". Allowed statuses are ACTIVE, INACTIVE, SUSPENDED, and BLOCKED.`
    );
  }

  return normalized as UserStatus;
}

export function validateMilkServiceStatus(rawStatus: unknown): MilkServiceStatus {
  if (typeof rawStatus !== 'string') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Milk service status is required and must be one of PENDING_ACTIVATION, ACTIVE, PAUSED, or STOPPED.'
    );
  }
  const normalized = rawStatus.trim().toUpperCase();
  if (!VALID_MILK_SERVICE_STATUSES.includes(normalized as MilkServiceStatus)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Invalid milk service status "${rawStatus}". Allowed: ${VALID_MILK_SERVICE_STATUSES.join(', ')}.`
    );
  }
  return normalized as MilkServiceStatus;
}

export function validateProductOrderServiceStatus(rawStatus: unknown): ProductOrderServiceStatus {
  if (typeof rawStatus !== 'string') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Product order service status is required and must be one of ACTIVE, PAUSED, or STOPPED.'
    );
  }
  const normalized = rawStatus.trim().toUpperCase();
  if (!VALID_PRODUCT_ORDER_SERVICE_STATUSES.includes(normalized as ProductOrderServiceStatus)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Invalid product order service status "${rawStatus}". Allowed: ${VALID_PRODUCT_ORDER_SERVICE_STATUSES.join(', ')}.`
    );
  }
  return normalized as ProductOrderServiceStatus;
}

export function validateWeeklyScheduleStatus(rawStatus: unknown): WeeklyScheduleStatus {
  if (typeof rawStatus !== 'string') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Weekly schedule status is required and must be one of ACTIVE, INACTIVE, or PAUSED.'
    );
  }
  const normalized = rawStatus.trim().toUpperCase();
  if (!VALID_WEEKLY_SCHEDULE_STATUSES.includes(normalized as WeeklyScheduleStatus)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Invalid schedule status "${rawStatus}". Allowed: ${VALID_WEEKLY_SCHEDULE_STATUSES.join(', ')}.`
    );
  }
  return normalized as WeeklyScheduleStatus;
}

export function validateStatusReason(
  rawReason: unknown,
  required: boolean,
  fieldLabel = 'Reason'
): string | undefined {
  if (rawReason === undefined || rawReason === null || rawReason === '') {
    if (required) {
      throw new AppError(400, 'VALIDATION_ERROR', `${fieldLabel} is required for this status change and must be at least 10 characters.`);
    }
    return undefined;
  }
  if (typeof rawReason !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldLabel} must be a string.`);
  }
  const trimmed = rawReason.trim();
  if (required && trimmed.length < 10) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldLabel} must be at least 10 characters.`);
  }
  if (trimmed.length > 250) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldLabel} cannot exceed 250 characters.`);
  }
  return trimmed || undefined;
}

export function validateTagList(rawTags: unknown): string[] {
  if (rawTags === undefined || rawTags === null) return [];
  if (!Array.isArray(rawTags)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Tags must be an array of strings.');
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of rawTags) {
    if (typeof t !== 'string') throw new AppError(400, 'VALIDATION_ERROR', 'Each tag must be a string.');
    const trimmed = t.trim();
    if (!/^[A-Za-z0-9_-]{2,20}$/.test(trimmed)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Invalid tag "${t}". Tags must be 2-20 chars: A-Za-z0-9_-.`);
    }
    const upper = trimmed; // preserve case but deduplicate case-insensitive
    if (!seen.has(upper.toLowerCase())) {
      seen.add(upper.toLowerCase());
      out.push(trimmed);
    }
  }
  return out;
}

export function validatePagination(raw: { page?: unknown; limit?: unknown; sort?: unknown }): { page: number; limit: number; sort: string } {
  let page = 1;
  if (raw.page !== undefined) {
    const p = Number(raw.page);
    if (!Number.isInteger(p) || p < 1) throw new AppError(400, 'VALIDATION_ERROR', 'Page must be integer >=1');
    page = p;
  }
  let limit = 20;
  if (raw.limit !== undefined) {
    const l = Number(raw.limit);
    if (!Number.isInteger(l) || l < 1 || l > 100) throw new AppError(400, 'VALIDATION_ERROR', 'Limit must be integer between 1 and 100');
    limit = l;
  }
  const sort = typeof raw.sort === 'string' ? raw.sort.trim() : 'createdAt';
  return { page, limit, sort };
}

export function validateDeliveryAddressInput(raw: unknown): Omit<DeliveryAddress, 'addressId' | 'isArchived' | 'createdAt' | 'updatedAt'> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Delivery address must be a valid object.');
  }
  const a = raw as Record<string, unknown>;
  const sanitize = (field: unknown, fieldName: string, maxLen: number, required = false): string | undefined => {
    if (field === undefined || field === null || field === '') {
      if (required) throw new AppError(400, 'VALIDATION_ERROR', `Address field "${fieldName}" is required.`);
      return undefined;
    }
    if (typeof field !== 'string') throw new AppError(400, 'VALIDATION_ERROR', `Address field "${fieldName}" must be a string.`);
    const trimmed = field.trim();
    if (trimmed.length > maxLen) throw new AppError(400, 'VALIDATION_ERROR', `Address field "${fieldName}" cannot exceed ${maxLen} characters.`);
    return trimmed || undefined;
  };
  const line1 = sanitize(a.line1, 'line1', 150, true);
  if (!line1) throw new AppError(400, 'VALIDATION_ERROR', 'Address line1 is required.');
  const pincode = sanitize(a.pincode, 'pincode', 6, true);
  if (!pincode || !PINCODE_REGEX.test(pincode)) throw new AppError(400, 'VALIDATION_ERROR', 'Pincode must be a valid 6-digit number.');

  let label: DeliveryAddressLabel = 'HOME';
  if (a.label !== undefined && a.label !== null && a.label !== '') {
    if (typeof a.label !== 'string') throw new AppError(400, 'VALIDATION_ERROR', 'Address label must be a string.');
    const norm = a.label.trim().toUpperCase();
    if (!VALID_DELIVERY_ADDRESS_LABELS.includes(norm as DeliveryAddressLabel)) throw new AppError(400, 'VALIDATION_ERROR', `Invalid label "${a.label}". Allowed: ${VALID_DELIVERY_ADDRESS_LABELS.join(', ')}`);
    label = norm as DeliveryAddressLabel;
  }

  return {
    label,
    line1: line1!,
    line2: sanitize(a.line2, 'line2', 150),
    landmark: sanitize(a.landmark, 'landmark', 120),
    city: sanitize(a.city, 'city', 80),
    pincode: pincode!,
    deliveryNotes: sanitize(a.deliveryNotes, 'deliveryNotes', 250),
  };
}

export function validateWeeklyScheduleInput(raw: unknown): {
  monday: { quantityLitres: number };
  tuesday: { quantityLitres: number };
  wednesday: { quantityLitres: number };
  thursday: { quantityLitres: number };
  friday: { quantityLitres: number };
  saturday: { quantityLitres: number };
  sunday: { quantityLitres: number };
  status?: WeeklyScheduleStatus;
  pausedUntil?: Date | null;
  effectiveFrom?: Date;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Weekly schedule must be a valid object.');
  }
  const o = raw as Record<string, unknown>;
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
  const out: Record<string, { quantityLitres: number }> = {};
  for (const d of days) {
    const val = o[d];
    if (val === undefined) {
      // Allow partial updates: skip if not provided; caller must handle partial vs full
      continue;
    }
    if (!val || typeof val !== 'object' || Array.isArray(val)) throw new AppError(400, 'VALIDATION_ERROR', `Schedule day "${d}" must be an object with quantityLitres.`);
    const q = (val as Record<string, unknown>).quantityLitres;
    if (typeof q !== 'number' || !Number.isFinite(q)) throw new AppError(400, 'VALIDATION_ERROR', `Schedule day "${d}" quantityLitres must be a number.`);
    if (q !== 0 && (q < 0 || Number(q.toFixed(2)) !== q)) throw new AppError(400, 'VALIDATION_ERROR', `Schedule day "${d}" quantityLitres must be 0 or >0 with 0.01 precision.`);
    if (q < 0) throw new AppError(400, 'VALIDATION_ERROR', `Schedule day "${d}" quantityLitres cannot be negative.`);
    out[d] = { quantityLitres: q };
  }
  let status: WeeklyScheduleStatus | undefined;
  if (o.status !== undefined) status = validateWeeklyScheduleStatus(o.status);
  let pausedUntil: Date | null | undefined;
  if (o.pausedUntil !== undefined) {
    if (o.pausedUntil === null) pausedUntil = null;
    else if (typeof o.pausedUntil === 'string') {
      const d = new Date(o.pausedUntil);
      if (Number.isNaN(d.getTime())) throw new AppError(400, 'VALIDATION_ERROR', 'pausedUntil must be a valid ISO date string.');
      pausedUntil = d;
    } else throw new AppError(400, 'VALIDATION_ERROR', 'pausedUntil must be a date string or null.');
  }
  let effectiveFrom: Date | undefined;
  if (o.effectiveFrom !== undefined) {
    if (typeof o.effectiveFrom !== 'string') throw new AppError(400, 'VALIDATION_ERROR', 'effectiveFrom must be a date string.');
    const d = new Date(o.effectiveFrom);
    if (Number.isNaN(d.getTime())) throw new AppError(400, 'VALIDATION_ERROR', 'effectiveFrom must be valid date.');
    effectiveFrom = d;
  }
  // Return only provided days; service will merge with existing
  return { ...out, status, pausedUntil, effectiveFrom } as unknown as ReturnType<typeof validateWeeklyScheduleInput>;
}

export function validateStaffPermissions(
  rawPermissions: unknown
): StaffPermission[] {
  if (rawPermissions === undefined || rawPermissions === null) {
    return [];
  }

  if (!Array.isArray(rawPermissions)) {
    throw new AppError(
      400,
      'INVALID_STAFF_PERMISSION',
      'staffPermissions must be an array of approved view-only permission strings.'
    );
  }

  const uniquePermissions = new Set<StaffPermission>();
  for (const item of rawPermissions) {
    if (typeof item !== 'string') {
      throw new AppError(
        400,
        'INVALID_STAFF_PERMISSION',
        'Each staff permission must be a string.'
      );
    }
    const normalized = item.trim().toUpperCase();
    if (
      !APPROVED_STAFF_PERMISSIONS.includes(normalized as StaffPermission)
    ) {
      throw new AppError(
        400,
        'INVALID_STAFF_PERMISSION',
        `Unapproved staff permission "${item}". Staff accounts are strictly view-only and may only hold approved VIEW_* permissions.`
      );
    }
    uniquePermissions.add(normalized as StaffPermission);
  }

  return Array.from(uniquePermissions);
}

export function validateFarmerProfile(
  rawProfile: unknown,
  topLevelBusinessContactMobile?: unknown
): FarmerProfile {
  const profileObj =
    rawProfile && typeof rawProfile === 'object' && !Array.isArray(rawProfile)
      ? (rawProfile as Record<string, unknown>)
      : {};

  const rawBusinessMobile =
    profileObj.businessContactMobile ?? topLevelBusinessContactMobile;

  const businessContactMobile = normalizeAndValidateMobileNumber(
    rawBusinessMobile,
    'Farmer business contact mobile number'
  );

  let villageOrLocation: string | undefined;
  if (
    profileObj.villageOrLocation !== undefined &&
    profileObj.villageOrLocation !== null &&
    profileObj.villageOrLocation !== ''
  ) {
    if (typeof profileObj.villageOrLocation !== 'string') {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Farmer villageOrLocation must be a string.'
      );
    }
    const trimmed = profileObj.villageOrLocation.trim();
    if (trimmed.length > 120) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Farmer villageOrLocation cannot exceed 120 characters.'
      );
    }
    villageOrLocation = trimmed || undefined;
  }

  let suppliedMilkTypes: MilkType[] = ['BUFFALO'];
  if (profileObj.suppliedMilkTypes !== undefined) {
    if (
      !Array.isArray(profileObj.suppliedMilkTypes) ||
      profileObj.suppliedMilkTypes.length === 0
    ) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'suppliedMilkTypes must be a non-empty array of BUFFALO and/or COW.'
      );
    }
    const validMilkSet = new Set<MilkType>();
    for (const m of profileObj.suppliedMilkTypes) {
      if (m !== 'BUFFALO' && m !== 'COW') {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Invalid milk type "${String(m)}". Allowed values are BUFFALO and COW.`
        );
      }
      validMilkSet.add(m);
    }
    suppliedMilkTypes = Array.from(validMilkSet);
  }

  return {
    businessContactMobile,
    villageOrLocation,
    suppliedMilkTypes,
  };
}

export function validateGrazingWorkerProfile(
  rawProfile: unknown
): GrazingWorkerProfile | undefined {
  if (rawProfile === undefined || rawProfile === null) {
    return undefined;
  }

  if (typeof rawProfile !== 'object' || Array.isArray(rawProfile)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'grazingWorkerProfile must be a valid object.'
    );
  }

  const profileObj = rawProfile as Record<string, unknown>;
  let emergencyContactMobile: string | undefined;
  if (
    profileObj.emergencyContactMobile !== undefined &&
    profileObj.emergencyContactMobile !== null &&
    profileObj.emergencyContactMobile !== '' 
  ) {
    emergencyContactMobile = normalizeAndValidateMobileNumber(
      profileObj.emergencyContactMobile,
      'Emergency contact mobile number'
    );
  }

  let assignedNotes: string | undefined;
  if (
    profileObj.assignedNotes !== undefined &&
    profileObj.assignedNotes !== null &&
    profileObj.assignedNotes !== '' 
  ) {
    if (typeof profileObj.assignedNotes !== 'string') {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'assignedNotes must be a string.'
      );
    }
    const trimmed = profileObj.assignedNotes.trim();
    if (trimmed.length > 250) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'assignedNotes cannot exceed 250 characters.'
      );
    }
    assignedNotes = trimmed || undefined;
  }

  return {
    emergencyContactMobile,
    assignedNotes,
  };
}

export function validateCustomerAddress(
  rawAddress: unknown
): CustomerAddress | undefined {
  if (rawAddress === undefined || rawAddress === null) {
    return undefined;
  }

  if (typeof rawAddress !== 'object' || Array.isArray(rawAddress)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Address must be a valid object.'
    );
  }

  const addr = rawAddress as Record<string, unknown>;
  const sanitizeField = (
    field: unknown,
    fieldName: string,
    maxLen: number
  ): string | undefined => {
    if (field === undefined || field === null || field === '') {
      return undefined;
    }
    if (typeof field !== 'string') {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Address field "${fieldName}" must be a string.`
      );
    }
    const trimmed = field.trim();
    if (trimmed.length > maxLen) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Address field "${fieldName}" cannot exceed ${maxLen} characters.`
      );
    }
    return trimmed || undefined;
  };

  const pincode = sanitizeField(addr.pincode, 'pincode', 6);
  if (pincode !== undefined && !PINCODE_REGEX.test(pincode)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Pincode must be a valid 6-digit number.'
    );
  }

  return {
    line1: sanitizeField(addr.line1, 'line1', 150),
    line2: sanitizeField(addr.line2, 'line2', 150),
    landmark: sanitizeField(addr.landmark, 'landmark', 120),
    city: sanitizeField(addr.city, 'city', 80),
    pincode,
    deliveryNotes: sanitizeField(addr.deliveryNotes, 'deliveryNotes', 250),
  };
}
