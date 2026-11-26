import { AppError } from '../middleware/notFound';
import { CustomerAddress } from '../models/User';

const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;
const PINCODE_REGEX = /^\d{6}$/;

export function normalizeAndValidateMobileNumber(rawMobile: unknown): string {
  if (typeof rawMobile !== 'string') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Mobile number is required and must be a string.'
    );
  }

  // Strip whitespace, hyphens, and optional +91 / 91 prefix if 12 digits
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
      'Mobile number must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.'
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
