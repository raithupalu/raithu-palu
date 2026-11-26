import { AppError } from '../middleware/notFound';
import {
  PublicUserProfile,
  toPublicUserProfile,
  UserRole,
  UserStatus,
  StaffPermission,
  APPROVED_STAFF_PERMISSIONS,
  VALID_USER_STATUSES,
} from '../models/User';
import { AuditLogEntity } from '../models/AuditLog';
import {
  userRepository,
  UpdateManagedAccountInput,
} from '../repositories/userRepository';
import { auditLogRepository } from '../repositories/auditLogRepository';
import { hashPassword } from './authService';
import {
  normalizeAndValidateMobileNumber,
  validateAccountStatus,
  validateFarmerProfile,
  validateFullName,
  validateGrazingWorkerProfile,
  validateManagedRole,
  validatePasswordStrength,
  validateStaffPermissions,
} from '../utils/authValidation';

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

export const adminAccountService = {
  async createManagedAccount(
    actorAdmin: PublicUserProfile,
    rawInput: Record<string, unknown>
  ): Promise<PublicUserProfile> {
    const role = validateManagedRole(rawInput.role);
    const fullName = validateFullName(rawInput.fullName);
    const mobileNumber = normalizeAndValidateMobileNumber(
      rawInput.mobileNumber,
      role === 'FARMER' ? 'Farmer login mobile number' : 'Login mobile number'
    );
    const password = validatePasswordStrength(rawInput.password);
    const status: UserStatus =
      rawInput.status !== undefined
        ? validateAccountStatus(rawInput.status)
        : 'ACTIVE';

    // Disallow cross-role fields
    if (role !== 'STAFF' && rawInput.staffPermissions !== undefined) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'staffPermissions can only be configured for STAFF accounts.'
      );
    }
    if (
      role !== 'FARMER' &&
      (rawInput.farmerProfile !== undefined ||
        rawInput.businessContactMobile !== undefined)
    ) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'farmerProfile and businessContactMobile can only be configured for FARMER accounts.'
      );
    }

    const staffPermissions =
      role === 'STAFF'
        ? validateStaffPermissions(rawInput.staffPermissions)
        : undefined;

    const farmerProfile =
      role === 'FARMER'
        ? validateFarmerProfile(
            rawInput.farmerProfile,
            rawInput.businessContactMobile
          )
        : undefined;

    const grazingWorkerProfile =
      role === 'GRAZING_WORKER'
        ? validateGrazingWorkerProfile(rawInput.grazingWorkerProfile)
        : undefined;

    const passwordHash = await hashPassword(password);

    const createdUser = await userRepository.createManagedAccount({
      fullName,
      mobileNumber,
      passwordHash,
      role,
      status,
      staffPermissions,
      farmerProfile,
      grazingWorkerProfile,
      createdBy: actorAdmin.id,
    });

    await auditLogRepository.record({
      action: 'ACCOUNT_CREATED',
      actorId: actorAdmin.id,
      actorRole: actorAdmin.role,
      targetUserId: createdUser.id,
      targetUserCode: createdUser.userCode,
      targetRole: createdUser.role,
      summary: `Admin ${actorAdmin.userCode} created ${createdUser.role} account ${createdUser.userCode} (${createdUser.fullName}).`,
      metadata: {
        role: createdUser.role,
        status: createdUser.status,
        loginMobileNumber: createdUser.mobileNumber,
        ...(createdUser.role === 'FARMER' && createdUser.farmerProfile
          ? {
              businessContactMobile:
                createdUser.farmerProfile.businessContactMobile,
              villageOrLocation: createdUser.farmerProfile.villageOrLocation,
              suppliedMilkTypes: createdUser.farmerProfile.suppliedMilkTypes,
            }
          : {}),
        ...(createdUser.role === 'STAFF'
          ? { staffPermissions: createdUser.staffPermissions ?? [] }
          : {}),
      },
    });

    return toPublicUserProfile(createdUser);
  },

  async listAccounts(rawFilter: {
    role?: unknown;
    status?: unknown;
    search?: unknown;
  }): Promise<{
    accounts: PublicUserProfile[];
    metrics: AccountSummaryMetrics;
    approvedStaffPermissions: readonly StaffPermission[];
  }> {
    let roleFilter: UserRole | 'ALL_MANAGED' | undefined = 'ALL_MANAGED';
    if (
      typeof rawFilter.role === 'string' &&
      rawFilter.role.trim().length > 0
    ) {
      const normalizedRole = rawFilter.role.trim().toUpperCase();
      if (normalizedRole === 'ALL') {
        roleFilter = undefined;
      } else if (normalizedRole === 'ALL_MANAGED') {
        roleFilter = 'ALL_MANAGED';
      } else if (
        normalizedRole === 'STAFF' ||
        normalizedRole === 'FARMER' ||
        normalizedRole === 'GRAZING_WORKER' ||
        normalizedRole === 'CUSTOMER' ||
        normalizedRole === 'ADMIN'
      ) {
        roleFilter = normalizedRole;
      } else {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Invalid role filter "${rawFilter.role}".`
        );
      }
    }

    let statusFilter: UserStatus | undefined;
    if (
      typeof rawFilter.status === 'string' &&
      rawFilter.status.trim().length > 0 &&
      rawFilter.status.trim().toUpperCase() !== 'ALL'
    ) {
      statusFilter = validateAccountStatus(rawFilter.status);
    }

    const search =
      typeof rawFilter.search === 'string' ? rawFilter.search.trim() : undefined;

    const matchingEntities = await userRepository.listAccounts({
      role: roleFilter,
      status: statusFilter,
      search,
    });

    const allEntities = await userRepository.listAccounts({});
    const metrics: AccountSummaryMetrics = {
      totalManaged: 0,
      byRole: {
        STAFF: 0,
        FARMER: 0,
        GRAZING_WORKER: 0,
        CUSTOMER: 0,
        ADMIN: 0,
      },
      byStatus: {
        ACTIVE: 0,
        INACTIVE: 0,
        SUSPENDED: 0,
        BLOCKED: 0,
      },
    };

    for (const user of allEntities) {
      metrics.byRole[user.role] = (metrics.byRole[user.role] ?? 0) + 1;
      if (
        user.role === 'STAFF' ||
        user.role === 'FARMER' ||
        user.role === 'GRAZING_WORKER'
      ) {
        metrics.totalManaged += 1;
        if (VALID_USER_STATUSES.includes(user.status)) {
          metrics.byStatus[user.status] += 1;
        }
      }
    }

    return {
      accounts: matchingEntities.map(toPublicUserProfile),
      metrics,
      approvedStaffPermissions: APPROVED_STAFF_PERMISSIONS,
    };
  },

  async getAccountDetails(accountId: string): Promise<{
    account: PublicUserProfile;
    auditLogs: AuditLogEntity[];
  }> {
    const user = await userRepository.findById(accountId);
    if (!user) {
      throw new AppError(
        404,
        'ACCOUNT_NOT_FOUND',
        'Requested account was not found.'
      );
    }

    const auditLogs = await auditLogRepository.list({
      targetUserId: user.id,
      limit: 25,
    });

    return {
      account: toPublicUserProfile(user),
      auditLogs,
    };
  },

  async updateAccount(
    actorAdmin: PublicUserProfile,
    accountId: string,
    rawUpdates: Record<string, unknown>
  ): Promise<PublicUserProfile> {
    const existing = await userRepository.findById(accountId);
    if (!existing) {
      throw new AppError(
        404,
        'ACCOUNT_NOT_FOUND',
        'Requested account was not found.'
      );
    }

    // Role and userCode are strictly immutable
    if (
      rawUpdates.role !== undefined &&
      rawUpdates.role !== existing.role
    ) {
      throw new AppError(
        400,
        'IMMUTABLE_ACCOUNT_FIELD',
        'Account role cannot be changed after creation.'
      );
    }
    if (
      rawUpdates.userCode !== undefined &&
      rawUpdates.userCode !== existing.userCode
    ) {
      throw new AppError(
        400,
        'IMMUTABLE_ACCOUNT_FIELD',
        'Account userCode cannot be modified.'
      );
    }
    if ('passwordHash' in rawUpdates || 'tokenVersion' in rawUpdates) {
      throw new AppError(
        400,
        'IMMUTABLE_ACCOUNT_FIELD',
        'Internal security fields cannot be modified directly.'
      );
    }

    const updates: UpdateManagedAccountInput = {};
    const changedFields: string[] = [];

    if (rawUpdates.fullName !== undefined) {
      updates.fullName = validateFullName(rawUpdates.fullName);
      changedFields.push('fullName');
    }

    if (rawUpdates.mobileNumber !== undefined) {
      updates.mobileNumber = normalizeAndValidateMobileNumber(
        rawUpdates.mobileNumber,
        existing.role === 'FARMER'
          ? 'Farmer login mobile number'
          : 'Login mobile number'
      );
      changedFields.push('mobileNumber');
    }

    if (
      rawUpdates.password !== undefined &&
      rawUpdates.password !== null &&
      rawUpdates.password !== ''
    ) {
      const validPassword = validatePasswordStrength(rawUpdates.password);
      updates.passwordHash = await hashPassword(validPassword);
      changedFields.push('password');
    }

    if (rawUpdates.staffPermissions !== undefined) {
      if (existing.role !== 'STAFF') {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'staffPermissions can only be updated for STAFF accounts.'
        );
      }
      updates.staffPermissions = validateStaffPermissions(
        rawUpdates.staffPermissions
      );
      changedFields.push('staffPermissions');
    }

    if (
      rawUpdates.farmerProfile !== undefined ||
      rawUpdates.businessContactMobile !== undefined
    ) {
      if (existing.role !== 'FARMER') {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'farmerProfile and businessContactMobile can only be updated for FARMER accounts.'
        );
      }
      const mergedRawFarmerProfile = {
        ...(existing.farmerProfile ?? {}),
        ...(typeof rawUpdates.farmerProfile === 'object' &&
        rawUpdates.farmerProfile !== null
          ? (rawUpdates.farmerProfile as Record<string, unknown>)
          : {}),
      };
      updates.farmerProfile = validateFarmerProfile(
        mergedRawFarmerProfile,
        rawUpdates.businessContactMobile
      );
      changedFields.push('farmerProfile');
    }

    if (rawUpdates.grazingWorkerProfile !== undefined) {
      if (existing.role !== 'GRAZING_WORKER') {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'grazingWorkerProfile can only be updated for GRAZING_WORKER accounts.'
        );
      }
      updates.grazingWorkerProfile = validateGrazingWorkerProfile(
        rawUpdates.grazingWorkerProfile
      );
      changedFields.push('grazingWorkerProfile');
    }

    if (changedFields.length === 0) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'At least one valid account field must be provided for update.'
      );
    }

    const updated = await userRepository.updateManagedAccount(
      existing.id,
      updates
    );
    if (!updated) {
      throw new AppError(
        404,
        'ACCOUNT_NOT_FOUND',
        'Requested account was not found.'
      );
    }

    await auditLogRepository.record({
      action: changedFields.includes('staffPermissions')
        ? 'STAFF_PERMISSIONS_UPDATED'
        : changedFields.includes('password')
          ? 'ACCOUNT_PASSWORD_RESET'
          : 'ACCOUNT_UPDATED',
      actorId: actorAdmin.id,
      actorRole: actorAdmin.role,
      targetUserId: updated.id,
      targetUserCode: updated.userCode,
      targetRole: updated.role,
      summary: `Admin ${actorAdmin.userCode} updated ${updated.role} account ${updated.userCode} (${changedFields.join(', ')}).`,
      metadata: {
        changedFields,
        ...(updated.role === 'FARMER' && updated.farmerProfile
          ? {
              loginMobileNumber: updated.mobileNumber,
              businessContactMobile:
                updated.farmerProfile.businessContactMobile,
            }
          : {}),
        ...(updated.role === 'STAFF'
          ? { staffPermissions: updated.staffPermissions ?? [] }
          : {}),
      },
    });

    return toPublicUserProfile(updated);
  },

  async updateAccountStatus(
    actorAdmin: PublicUserProfile,
    accountId: string,
    rawInput: { status?: unknown; reason?: unknown }
  ): Promise<{ account: PublicUserProfile; sessionRevoked: boolean }> {
    const existing = await userRepository.findById(accountId);
    if (!existing) {
      throw new AppError(
        404,
        'ACCOUNT_NOT_FOUND',
        'Requested account was not found.'
      );
    }

    const newStatus = validateAccountStatus(rawInput.status);

    if (actorAdmin.id === existing.id && newStatus !== 'ACTIVE') {
      throw new AppError(
        400,
        'SELF_DEACTIVATION_FORBIDDEN',
        'An Admin cannot deactivate, suspend, or block their own active account.'
      );
    }

    let statusReason: string | undefined;
    if (
      rawInput.reason !== undefined &&
      rawInput.reason !== null &&
      rawInput.reason !== ''
    ) {
      if (typeof rawInput.reason !== 'string') {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Status change reason must be a string.'
        );
      }
      const trimmed = rawInput.reason.trim();
      if (trimmed.length > 250) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Status change reason cannot exceed 250 characters.'
        );
      }
      statusReason = trimmed;
    }

    const previousStatus = existing.status;
    const sessionRevoked = newStatus !== 'ACTIVE';

    const updated = await userRepository.updateAccountStatus(
      existing.id,
      newStatus,
      statusReason
    );
    if (!updated) {
      throw new AppError(
        404,
        'ACCOUNT_NOT_FOUND',
        'Requested account was not found.'
      );
    }

    await auditLogRepository.record({
      action: 'ACCOUNT_STATUS_CHANGED',
      actorId: actorAdmin.id,
      actorRole: actorAdmin.role,
      targetUserId: updated.id,
      targetUserCode: updated.userCode,
      targetRole: updated.role,
      summary: `Admin ${actorAdmin.userCode} changed status of ${updated.userCode} (${updated.fullName}) from ${previousStatus} to ${newStatus}.${sessionRevoked ? ' Active sessions revoked.' : ''}`,
      metadata: {
        previousStatus,
        newStatus,
        reason: statusReason ?? null,
        sessionRevoked,
      },
    });

    return {
      account: toPublicUserProfile(updated),
      sessionRevoked,
    };
  },

  async updateStaffPermissions(
    actorAdmin: PublicUserProfile,
    accountId: string,
    rawPermissions: unknown
  ): Promise<PublicUserProfile> {
    const existing = await userRepository.findById(accountId);
    if (!existing) {
      throw new AppError(
        404,
        'ACCOUNT_NOT_FOUND',
        'Requested account was not found.'
      );
    }

    if (existing.role !== 'STAFF') {
      throw new AppError(
        400,
        'INVALID_TARGET_ROLE',
        'Custom staff permissions can only be configured for STAFF accounts.'
      );
    }

    const previousPermissions = [...(existing.staffPermissions ?? [])];
    const newPermissions = validateStaffPermissions(rawPermissions);

    const updated = await userRepository.updateManagedAccount(existing.id, {
      staffPermissions: newPermissions,
    });
    if (!updated) {
      throw new AppError(
        404,
        'ACCOUNT_NOT_FOUND',
        'Requested account was not found.'
      );
    }

    await auditLogRepository.record({
      action: 'STAFF_PERMISSIONS_UPDATED',
      actorId: actorAdmin.id,
      actorRole: actorAdmin.role,
      targetUserId: updated.id,
      targetUserCode: updated.userCode,
      targetRole: updated.role,
      summary: `Admin ${actorAdmin.userCode} updated view-only permissions for Staff ${updated.userCode} (${updated.fullName}).`,
      metadata: {
        previousPermissions,
        newPermissions,
      },
    });

    return toPublicUserProfile(updated);
  },

  async listAuditLogs(rawQuery: {
    targetUserId?: unknown;
    limit?: unknown;
  }): Promise<AuditLogEntity[]> {
    const targetUserId =
      typeof rawQuery.targetUserId === 'string' &&
      rawQuery.targetUserId.trim().length > 0
        ? rawQuery.targetUserId.trim()
        : undefined;

    let limit = 50;
    if (typeof rawQuery.limit === 'string') {
      const parsed = Number.parseInt(rawQuery.limit, 10);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 200) {
        limit = parsed;
      }
    }

    return auditLogRepository.list({ targetUserId, limit });
  },
};
