import crypto from 'crypto';
import { AppError } from '../middleware/notFound';
import { toPublicUserProfile } from '../models/User';
import { userRepository } from '../repositories/userRepository';
import { auditLogRepository } from '../repositories/auditLogRepository';
import { validateDeliveryAddressInput } from '../utils/authValidation';
import { DeliveryAddress } from '../models/User';

export const customerSelfService = {
  async addAddress(userId: string, raw: unknown): Promise<ReturnType<typeof toPublicUserProfile>> {
    const v = validateDeliveryAddressInput(raw);
    const addr: DeliveryAddress = {
      addressId: crypto.randomUUID(),
      label: v.label,
      line1: v.line1,
      line2: v.line2,
      landmark: v.landmark,
      city: v.city,
      pincode: v.pincode,
      deliveryNotes: v.deliveryNotes,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const updated = await userRepository.addDeliveryAddress(userId, addr);
    if (!updated) throw new AppError(404,'USER_NOT_FOUND','User not found');
    await auditLogRepository.record({
      action: 'ADDRESS_CREATED',
      actorId: updated.id,
      actorRole: updated.role,
      targetUserId: updated.id,
      targetUserCode: updated.userCode,
      targetRole: updated.role,
      summary: `Customer ${updated.userCode} added delivery address`,
      metadata: { addressId: addr.addressId },
    });
    return toPublicUserProfile(updated);
  },
  async updateAddress(userId: string, addressId: string, raw: unknown): Promise<ReturnType<typeof toPublicUserProfile>> {
    const v = validateDeliveryAddressInput(raw);
    const updated = await userRepository.updateDeliveryAddress(userId, addressId, v);
    if (!updated) throw new AppError(404,'USER_NOT_FOUND','User not found');
    await auditLogRepository.record({
      action: 'ADDRESS_UPDATED',
      actorId: updated.id,
      actorRole: updated.role,
      targetUserId: updated.id,
      targetUserCode: updated.userCode,
      targetRole: updated.role,
      summary: `Customer ${updated.userCode} updated address ${addressId}`,
      metadata: { addressId },
    });
    return toPublicUserProfile(updated);
  },
  async activateAddress(userId: string, addressId: string): Promise<ReturnType<typeof toPublicUserProfile>> {
    const updated = await userRepository.setActiveDeliveryAddress(userId, addressId);
    if (!updated) throw new AppError(404,'USER_NOT_FOUND','User not found');
    await auditLogRepository.record({
      action: 'ACTIVE_ADDRESS_CHANGED',
      actorId: updated.id,
      actorRole: updated.role,
      targetUserId: updated.id,
      targetUserCode: updated.userCode,
      targetRole: updated.role,
      summary: `Customer ${updated.userCode} activated address ${addressId}`,
      metadata: { addressId },
    });
    return toPublicUserProfile(updated);
  },
  async archiveAddress(userId: string, addressId: string): Promise<ReturnType<typeof toPublicUserProfile>> {
    const updated = await userRepository.archiveDeliveryAddress(userId, addressId);
    if (!updated) throw new AppError(404,'USER_NOT_FOUND','User not found');
    await auditLogRepository.record({
      action: 'ADDRESS_ARCHIVED',
      actorId: updated.id,
      actorRole: updated.role,
      targetUserId: updated.id,
      targetUserCode: updated.userCode,
      targetRole: updated.role,
      summary: `Customer ${updated.userCode} archived address ${addressId}`,
      metadata: { addressId },
    });
    return toPublicUserProfile(updated);
  },
};
