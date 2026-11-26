import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../middleware/notFound';
import {
  PublicUserProfile,
  toPublicUserProfile,
  UserEntity,
  UserRole,
} from '../models/User';
import { userRepository } from '../repositories/userRepository';
import {
  normalizeAndValidateMobileNumber,
  validateCustomerAddress,
  validateFullName,
  validatePasswordStrength,
} from '../utils/authValidation';

export interface JwtAccessPayload {
  sub: string;
  role: UserRole;
  tokenVersion: number;
  jti: string;
  iat?: number;
  exp?: number;
}

export interface AuthSessionResult {
  user: PublicUserProfile;
  accessToken: string;
  expiresIn: string;
}

// Precomputed bcrypt hash used when user does not exist to mitigate timing enumeration
const DUMMY_PASSWORD_HASH =
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

// In-memory revoked token JTI registry (maps jti -> exp unix timestamp in seconds)
const revokedTokenJtis = new Map<string, number>();

function pruneExpiredRevokedTokens(): void {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const [jti, expSec] of revokedTokenJtis.entries()) {
    if (expSec <= nowSec) {
      revokedTokenJtis.delete(jti);
    }
  }
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, env.BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(
  plainPassword: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}

export function signAccessToken(user: UserEntity): string {
  const payload: JwtAccessPayload = {
    sub: user.id,
    role: user.role,
    tokenVersion: user.tokenVersion,
    jti: crypto.randomUUID(),
  };

  const signOptions: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: 'raithu-palu-backend',
    audience: 'raithu-palu-client',
  };

  return jwt.sign(payload, env.JWT_SECRET, signOptions);
}

export function verifyAccessToken(token: string): JwtAccessPayload {
  pruneExpiredRevokedTokens();

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'raithu-palu-backend',
      audience: 'raithu-palu-client',
    }) as JwtAccessPayload;

    if (!decoded || typeof decoded.sub !== 'string' || !decoded.jti) {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid authentication token.');
    }

    if (revokedTokenJtis.has(decoded.jti)) {
      throw new AppError(
        401,
        'TOKEN_REVOKED',
        'Authentication session has been logged out. Please log in again.'
      );
    }

    return decoded;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(
      401,
      'INVALID_OR_EXPIRED_TOKEN',
      'Authentication token is invalid or has expired.'
    );
  }
}

export function revokeTokenJti(jti: string, exp?: number): void {
  const expirySec = exp ?? Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  revokedTokenJtis.set(jti, expirySec);
}

export const authService = {
  async registerCustomer(body: Record<string, unknown>): Promise<AuthSessionResult> {
    if (
      body.role !== undefined &&
      String(body.role).toUpperCase() !== 'CUSTOMER'
    ) {
      throw new AppError(
        403,
        'FORBIDDEN_ROLE_ASSIGNMENT',
        'Public registration is restricted to CUSTOMER accounts only.'
      );
    }

    const fullName = validateFullName(body.fullName);
    const mobileNumber = normalizeAndValidateMobileNumber(body.mobileNumber);
    const password = validatePasswordStrength(body.password);
    const address = validateCustomerAddress(body.address);

    const existing = await userRepository.findByMobileWithPassword(mobileNumber);
    if (existing) {
      throw new AppError(
        409,
        'MOBILE_ALREADY_REGISTERED',
        'An account with this mobile number is already registered.'
      );
    }

    const passwordHash = await hashPassword(password);

    const createdUser = await userRepository.createCustomer({
      fullName,
      mobileNumber,
      passwordHash,
      address,
    });

    const accessToken = signAccessToken(createdUser);

    return {
      user: toPublicUserProfile(createdUser),
      accessToken,
      expiresIn: env.JWT_EXPIRES_IN,
    };
  },

  async loginCustomer(body: Record<string, unknown>): Promise<AuthSessionResult> {
    const mobileNumber = normalizeAndValidateMobileNumber(body.mobileNumber);

    if (typeof body.password !== 'string' || body.password.length === 0) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Password is required.'
      );
    }

    const user = await userRepository.findByMobileWithPassword(mobileNumber);
    if (!user) {
      await verifyPassword(body.password, DUMMY_PASSWORD_HASH);
      throw new AppError(
        401,
        'INVALID_CREDENTIALS',
        'Invalid mobile number or password.'
      );
    }

    const passwordMatches = await verifyPassword(
      body.password,
      user.passwordHash
    );
    if (!passwordMatches) {
      throw new AppError(
        401,
        'INVALID_CREDENTIALS',
        'Invalid mobile number or password.'
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError(
        403,
        'ACCOUNT_INACTIVE',
        `Your account status is ${user.status}. Please contact Raithu Palu support.`
      );
    }

    if (user.role !== 'CUSTOMER') {
      throw new AppError(
        403,
        'ROLE_FORBIDDEN',
        'This login endpoint is restricted to Customer accounts.'
      );
    }

    const updatedUser = (await userRepository.recordLogin(user.id)) ?? user;
    const accessToken = signAccessToken(updatedUser);

    return {
      user: toPublicUserProfile(updatedUser),
      accessToken,
      expiresIn: env.JWT_EXPIRES_IN,
    };
  },

  async logoutSession(payload: JwtAccessPayload): Promise<void> {
    revokeTokenJti(payload.jti, payload.exp);
    await userRepository.recordLogout(payload.sub);
  },

  async getAuthenticatedCustomerProfile(userId: string): Promise<PublicUserProfile> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Customer account not found.');
    }
    if (user.status !== 'ACTIVE') {
      throw new AppError(
        403,
        'ACCOUNT_INACTIVE',
        `Your account status is ${user.status}.`
      );
    }
    return toPublicUserProfile(user);
  },

  async updateAuthenticatedCustomerProfile(
    userId: string,
    body: Record<string, unknown>
  ): Promise<PublicUserProfile> {
    const forbiddenFields = [
      'role',
      'status',
      'password',
      'passwordHash',
      'mobileNumber',
      'tokenVersion',
    ];
    for (const field of forbiddenFields) {
      if (body[field] !== undefined) {
        throw new AppError(
          400,
          'IMMUTABLE_PROFILE_FIELD',
          `Field "${field}" cannot be modified via customer profile update.`
        );
      }
    }

    const fullName =
      body.fullName !== undefined ? validateFullName(body.fullName) : undefined;
    const address =
      body.address !== undefined
        ? validateCustomerAddress(body.address)
        : undefined;

    if (fullName === undefined && address === undefined) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Provide at least one updatable field (fullName or address).'
      );
    }

    const updated = await userRepository.updateCustomerProfile(userId, {
      fullName,
      address,
    });
    if (!updated) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Customer account not found.');
    }

    return toPublicUserProfile(updated);
  },
};
