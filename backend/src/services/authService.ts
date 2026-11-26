import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../middleware/notFound';
import {
  CustomerAddress,
  PublicUserProfile,
  toPublicUserProfile,
  UserEntity,
  UserRole,
} from '../models/User';
import { userRepository } from '../repositories/userRepository';
import { auditLogRepository } from '../repositories/auditLogRepository';
import {
  normalizeAndValidateMobileNumber,
  validateCustomerAddress,
  validateFullName,
  validatePasswordStrength,
} from '../utils/authValidation';

export interface JwtAccessPayload {
  sub: string;
  role: UserRole;
  mobileNumber: string;
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

const revokedTokenJtis = new Map<string, number>();

function pruneExpiredRevokedJtis(): void {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const [jti, exp] of revokedTokenJtis.entries()) {
    if (exp <= nowSec) {
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
    mobileNumber: user.mobileNumber,
    tokenVersion: user.tokenVersion,
    jti: crypto.randomUUID(),
  };

  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: 'raithu-palu-api',
    audience: 'raithu-palu-client',
  };

  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): JwtAccessPayload {
  pruneExpiredRevokedJtis();

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'raithu-palu-api',
      audience: 'raithu-palu-client',
    }) as JwtAccessPayload;

    if (!decoded || typeof decoded.sub !== 'string' || !decoded.jti) {
      throw new AppError(
        401,
        'INVALID_TOKEN',
        'Invalid authentication token payload.'
      );
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
  const expiryEpoch = exp ?? Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  revokedTokenJtis.set(jti, expiryEpoch);
}

export const authService = {
  /**
   * Manual Admin Provisioning by an Authorized Technical Operator.
   * Never exposed via any public registration route.
   */
  async provisionOperatorAdmin(rawInput: {
    fullName: unknown;
    mobileNumber: unknown;
    password: unknown;
  }): Promise<{ user: PublicUserProfile; created: boolean }> {
    const fullName = validateFullName(rawInput.fullName);
    const mobileNumber = normalizeAndValidateMobileNumber(
      rawInput.mobileNumber,
      'Admin mobile number'
    );
    const password = validatePasswordStrength(rawInput.password);
    const passwordHash = await hashPassword(password);

    const { user, created } = await userRepository.provisionAdmin({
      fullName,
      mobileNumber,
      passwordHash,
    });

    await auditLogRepository.record({
      action: 'ADMIN_PROVISIONED',
      actorId: 'SYSTEM_OPERATOR',
      actorRole: 'SYSTEM_OPERATOR',
      targetUserId: user.id,
      targetUserCode: user.userCode,
      targetRole: 'ADMIN',
      summary: created
        ? `Provisioned Admin account ${user.userCode} (${user.fullName}) via operator provisioning.`
        : `Updated existing Admin account ${user.userCode} (${user.fullName}) via operator provisioning.`,
      metadata: {
        created,
        mobileNumber: user.mobileNumber,
      },
    });

    return {
      user: toPublicUserProfile(user),
      created,
    };
  },

  async registerCustomer(rawInput: {
    fullName: unknown;
    mobileNumber: unknown;
    password: unknown;
    address?: unknown;
  }): Promise<AuthSessionResult> {
    const fullName = validateFullName(rawInput.fullName);
    const mobileNumber = normalizeAndValidateMobileNumber(
      rawInput.mobileNumber
    );
    const password = validatePasswordStrength(rawInput.password);
    const address = validateCustomerAddress(rawInput.address);

    const existing =
      await userRepository.findByMobileWithPassword(mobileNumber);
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

  async loginWithRoleCheck(
    rawInput: {
      mobileNumber: unknown;
      password: unknown;
    },
    allowedRoles?: UserRole[]
  ): Promise<AuthSessionResult> {
    const mobileNumber = normalizeAndValidateMobileNumber(
      rawInput.mobileNumber
    );
    if (typeof rawInput.password !== 'string' || !rawInput.password) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Password is required.');
    }

    const user = await userRepository.findByMobileWithPassword(mobileNumber);
    if (!user) {
      throw new AppError(
        401,
        'INVALID_CREDENTIALS',
        'Invalid mobile number or password.'
      );
    }

    const isPasswordValid = await verifyPassword(
      rawInput.password,
      user.passwordHash
    );
    if (!isPasswordValid) {
      throw new AppError(
        401,
        'INVALID_CREDENTIALS',
        'Invalid mobile number or password.'
      );
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      throw new AppError(
        403,
        'ROLE_FORBIDDEN',
        allowedRoles.length === 1 && allowedRoles[0] === 'CUSTOMER'
          ? 'This login endpoint is restricted to Customer accounts.'
          : allowedRoles.length === 1 && allowedRoles[0] === 'ADMIN'
            ? 'This login endpoint is restricted to Admin accounts.'
            : `Access denied. Required role: ${allowedRoles.join(' or ')}.`
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError(
        403,
        'ACCOUNT_INACTIVE',
        `Your account status is ${user.status}. Please contact support.`
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

  async loginCustomer(rawInput: {
    mobileNumber: unknown;
    password: unknown;
  }): Promise<AuthSessionResult> {
    return this.loginWithRoleCheck(rawInput, ['CUSTOMER']);
  },

  async loginAdmin(rawInput: {
    mobileNumber: unknown;
    password: unknown;
  }): Promise<AuthSessionResult> {
    return this.loginWithRoleCheck(rawInput, ['ADMIN']);
  },

  async loginAnyRole(rawInput: {
    mobileNumber: unknown;
    password: unknown;
  }): Promise<AuthSessionResult> {
    return this.loginWithRoleCheck(rawInput);
  },

  async logoutSession(
    userId: string,
    tokenPayload?: JwtAccessPayload
  ): Promise<void> {
    if (tokenPayload?.jti) {
      revokeTokenJti(tokenPayload.jti, tokenPayload.exp);
    }
    await userRepository.recordLogout(userId);
  },

  async getCustomerProfile(userId: string): Promise<PublicUserProfile> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(
        404,
        'USER_NOT_FOUND',
        'Customer profile was not found.'
      );
    }
    if (user.role !== 'CUSTOMER') {
      throw new AppError(
        403,
        'FORBIDDEN_ROLE',
        'Profile endpoint is restricted to Customer accounts.'
      );
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

  async getAuthenticatedCustomerProfile(
    userId: string
  ): Promise<PublicUserProfile> {
    return this.getCustomerProfile(userId);
  },

  async getAuthenticatedSessionProfile(
    userId: string
  ): Promise<PublicUserProfile> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(
        404,
        'USER_NOT_FOUND',
        'Authenticated user profile was not found.'
      );
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

  async updateCustomerProfile(
    userId: string,
    rawUpdates: Record<string, unknown>
  ): Promise<PublicUserProfile> {
    const forbiddenKeys = [
      'role',
      'status',
      'mobileNumber',
      'password',
      'passwordHash',
      'tokenVersion',
      'userCode',
      'staffPermissions',
      'farmerProfile',
      'grazingWorkerProfile',
    ];
    for (const key of forbiddenKeys) {
      if (key in rawUpdates) {
        throw new AppError(
          400,
          'IMMUTABLE_PROFILE_FIELD',
          `Field "${key}" cannot be modified through the profile update endpoint.`
        );
      }
    }

    const updates: { fullName?: string; address?: CustomerAddress } = {};

    if (rawUpdates.fullName !== undefined) {
      updates.fullName = validateFullName(rawUpdates.fullName);
    }

    if (rawUpdates.address !== undefined) {
      updates.address = validateCustomerAddress(rawUpdates.address);
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'At least one valid profile field (fullName or address) must be provided for update.'
      );
    }

    const updated = await userRepository.updateCustomerProfile(userId, updates);
    if (!updated) {
      throw new AppError(
        404,
        'USER_NOT_FOUND',
        'Customer account was not found.'
      );
    }

    return toPublicUserProfile(updated);
  },

  async updateAuthenticatedCustomerProfile(
    userId: string,
    rawUpdates: Record<string, unknown>
  ): Promise<PublicUserProfile> {
    return this.updateCustomerProfile(userId, rawUpdates);
  },
};
