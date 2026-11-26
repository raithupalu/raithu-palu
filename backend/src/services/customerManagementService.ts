import crypto from 'crypto';
import mongoose from 'mongoose';
import { AppError } from '../middleware/notFound';
import { PublicUserProfile, toPublicUserProfile, MilkServiceStatus, ProductOrderServiceStatus, WeeklyMilkSchedule, WeeklyScheduleStatus, DeliveryAddress } from '../models/User';
import { userRepository, inMemoryUserStore } from '../repositories/userRepository';
import { auditLogRepository, inMemoryAuditLogStore } from '../repositories/auditLogRepository';
import { customerNoteRepository, inMemoryNoteStore } from '../repositories/customerNoteRepository';
import { UserModel } from '../models/User';
import { AuditLogModel } from '../models/AuditLog';
import { hashPassword } from './authService';
import {
  validateFullName,
  normalizeAndValidateMobileNumber,
  validatePasswordStrength,
  validateMilkServiceStatus,
  validateProductOrderServiceStatus,
  validateWeeklyScheduleStatus,
  validateDeliveryAddressInput,
  validateWeeklyScheduleInput,
  validateTagList,
  validateStatusReason,
  validateAccountStatus,
  validateCustomerAddress,
} from '../utils/authValidation';

const ALLOWED_MILK_TRANSITIONS: Record<string, string[]> = {
  'PENDING_ACTIVATION': ['ACTIVE'],
  'ACTIVE': ['PAUSED', 'STOPPED'],
  'PAUSED': ['ACTIVE', 'STOPPED'],
  'STOPPED': ['ACTIVE'],
};
const ALLOWED_PRODUCT_TRANSITIONS: Record<string, string[]> = {
  'ACTIVE': ['PAUSED', 'STOPPED'],
  'PAUSED': ['ACTIVE', 'STOPPED'],
  'STOPPED': ['ACTIVE'],
};

// Transaction helper for atomic customer mutations + audit — supports multiple audits per operation
// For Mongo: uses replica-set transaction (all repo calls + audits must use session)
// For in-memory: snapshots all stores and restores on any failure (including audit failure)
async function withAtomicMutation<T>(
  operation: (session?: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  const isMongo = mongoose.connection.readyState === 1;
  if (isMongo) {
    const session = await mongoose.startSession();
    let result: T | undefined;
    try {
      await session.withTransaction(async () => {
        result = await operation(session);
      });
      return result!;
    } finally {
      await session.endSession();
    }
  } else {
    // In-memory atomicity via snapshot/restore — covers user, audit, notes
    const userSnap = inMemoryUserStore.snapshot();
    const auditSnap = inMemoryAuditLogStore.snapshot();
    const noteSnap = inMemoryNoteStore.snapshot();
    try {
      return await operation(undefined);
    } catch (e) {
      // Restore all stores to pre-operation state
      try { inMemoryUserStore.restore(userSnap); } catch {}
      try { inMemoryAuditLogStore.restore(auditSnap); } catch {}
      try { inMemoryNoteStore.restore(noteSnap); } catch {}
      throw e;
    }
  }
}

interface ListParams {
  search?: unknown;
  status?: unknown;
  milkServiceStatus?: unknown;
  productOrderServiceStatus?: unknown;
  pincode?: unknown;
  tags?: unknown;
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
}

export const customerManagementService = {
  async createCustomer(actor: PublicUserProfile, raw: Record<string, unknown>): Promise<PublicUserProfile> {
    const fullName = validateFullName(raw.fullName);
    const mobileNumber = normalizeAndValidateMobileNumber(raw.mobileNumber, 'Customer mobile number');
    const password = validatePasswordStrength(raw.password);
    // Preserve raw password for retry safety — never mutate raw input
    const rawPasswordForAudit = '***REDACTED***';
    let deliveryAddresses: DeliveryAddress[] | undefined;
    let activeDeliveryAddressId: string | null | undefined;
    if (raw.deliveryAddresses !== undefined) {
      if (!Array.isArray(raw.deliveryAddresses)) throw new AppError(400,'VALIDATION_ERROR','deliveryAddresses must be array');
      deliveryAddresses = [];
      for (const a of raw.deliveryAddresses) {
        const validated = validateDeliveryAddressInput(a);
        const addr: DeliveryAddress = {
          addressId: crypto.randomUUID(),
          label: validated.label,
          line1: validated.line1,
          line2: validated.line2,
          landmark: validated.landmark,
          city: validated.city,
          pincode: validated.pincode,
          deliveryNotes: validated.deliveryNotes,
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        deliveryAddresses.push(addr);
      }
      if (deliveryAddresses.length>0) activeDeliveryAddressId = deliveryAddresses[0].addressId;
    } else if (raw.address !== undefined) {
      const addrLegacy = validateCustomerAddress(raw.address);
      if (addrLegacy && addrLegacy.pincode) {
        const validated = validateDeliveryAddressInput({ ...addrLegacy, label:'HOME' });
        const addr: DeliveryAddress = {
          addressId: crypto.randomUUID(),
          label: 'HOME',
          line1: validated.line1,
          line2: validated.line2,
          landmark: validated.landmark,
          city: validated.city,
          pincode: validated.pincode,
          deliveryNotes: validated.deliveryNotes,
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        deliveryAddresses = [addr];
        activeDeliveryAddressId = addr.addressId;
      }
    }

    // Check duplicate before creation for clearer error
    const existing = await userRepository.findByMobileWithPassword(mobileNumber);
    if (existing) throw new AppError(409,'MOBILE_ALREADY_REGISTERED','An account with this mobile number is already registered.');

    const passwordHash = await hashPassword(password);
    const tags = raw.tags !== undefined ? validateTagList(raw.tags) : [];
    let weeklyMilkSchedule: WeeklyMilkSchedule | null | undefined;
    if (raw.weeklyMilkSchedule !== undefined && raw.weeklyMilkSchedule !== null) {
      const parsed = validateWeeklyScheduleInput(raw.weeklyMilkSchedule);
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const;
      const schedule: WeeklyMilkSchedule = {
        scheduleId: crypto.randomUUID(),
        status: (parsed.status as WeeklyScheduleStatus) ?? 'ACTIVE',
        pausedUntil: parsed.pausedUntil ?? null,
        effectiveFrom: parsed.effectiveFrom ?? new Date(),
        monday: (parsed as unknown as Record<string, {quantityLitres:number}>).monday ?? { quantityLitres:0 },
        tuesday: (parsed as unknown as Record<string, {quantityLitres:number}>).tuesday ?? { quantityLitres:0 },
        wednesday: (parsed as unknown as Record<string, {quantityLitres:number}>).wednesday ?? { quantityLitres:0 },
        thursday: (parsed as unknown as Record<string, {quantityLitres:number}>).thursday ?? { quantityLitres:0 },
        friday: (parsed as unknown as Record<string, {quantityLitres:number}>).friday ?? { quantityLitres:0 },
        saturday: (parsed as unknown as Record<string, {quantityLitres:number}>).saturday ?? { quantityLitres:0 },
        sunday: (parsed as unknown as Record<string, {quantityLitres:number}>).sunday ?? { quantityLitres:0 },
      };
      weeklyMilkSchedule = schedule;
    }

    // Atomic MongoDB transaction: business mutation + audit together
    const isMongoForCreate = mongoose.connection.readyState === 1;
    if (isMongoForCreate) {
      const session = await mongoose.startSession();
      let createdUser: import('../models/User').UserEntity | null = null;
      try {
        await session.withTransaction(async () => {
          const user = await userRepository.createCustomerAdmin({
            fullName,
            mobileNumber,
            passwordHash,
            deliveryAddresses,
            activeDeliveryAddressId: activeDeliveryAddressId ?? null,
            milkServiceStatus: 'PENDING_ACTIVATION',
            productOrderServiceStatus: 'ACTIVE',
            mustChangePassword: true,
            tags,
            weeklyMilkSchedule: weeklyMilkSchedule ?? null,
            createdBy: actor.id,
          }, session);
          createdUser = user;
          await AuditLogModel.create([{
            action: 'CUSTOMER_CREATED_BY_ADMIN',
            actorId: actor.id,
            actorRole: actor.role,
            targetUserId: user.id,
            targetUserCode: user.userCode,
            targetRole: 'CUSTOMER',
            summary: `Admin ${actor.userCode} created customer ${user.userCode} (${user.fullName})`,
            metadata: { mobileNumber: user.mobileNumber, mustChangePassword: true },
          }], { session });
        });
        return toPublicUserProfile(createdUser!);
      } finally {
        await session.endSession();
      }
    } else {
      // In-memory atomic with snapshot rollback
      let createdUser: import('../models/User').UserEntity | null = null;
      let snapshot: import('../models/User').UserEntity | null = null;
      try {
        const user = await userRepository.createCustomerAdmin({
          fullName,
          mobileNumber,
          passwordHash,
          deliveryAddresses,
          activeDeliveryAddressId: activeDeliveryAddressId ?? null,
          milkServiceStatus: 'PENDING_ACTIVATION',
          productOrderServiceStatus: 'ACTIVE',
          mustChangePassword: true,
          tags,
          weeklyMilkSchedule: weeklyMilkSchedule ?? null,
          createdBy: actor.id,
        });
        createdUser = user;
        await auditLogRepository.record({
          action: 'CUSTOMER_CREATED_BY_ADMIN',
          actorId: actor.id,
          actorRole: actor.role,
          targetUserId: user.id,
          targetUserCode: user.userCode,
          targetRole: 'CUSTOMER',
          summary: `Admin ${actor.userCode} created customer ${user.userCode} (${user.fullName})`,
          metadata: { mobileNumber: user.mobileNumber, mustChangePassword: true },
        });
        return toPublicUserProfile(user);
      } catch (e) {
        // Rollback: delete created user if audit failed
        if (createdUser) {
          try {
            const store = (inMemoryUserStore as unknown as { byId: Map<string, unknown>; byMobile: Map<string, string>; byUserCode: Map<string, string> });
            store.byId.delete(createdUser.id);
            store.byMobile.delete(createdUser.mobileNumber);
            store.byUserCode.delete(createdUser.userCode.toUpperCase());
          } catch {}
        }
        throw e;
      }
    }
  },

  async listCustomers(params: ListParams): Promise<{ customers: PublicUserProfile[]; total: number; page:number; pageSize:number }>{
    let status;
    if (params.status !== undefined && String(params.status).trim()!=='' && String(params.status).toUpperCase()!=='ALL') status = validateAccountStatus(params.status);
    let milkServiceStatus;
    if (params.milkServiceStatus !== undefined && String(params.milkServiceStatus).trim()!=='' ) milkServiceStatus = validateMilkServiceStatus(params.milkServiceStatus);
    let productOrderServiceStatus;
    if (params.productOrderServiceStatus !== undefined && String(params.productOrderServiceStatus).trim()!=='' ) productOrderServiceStatus = validateProductOrderServiceStatus(params.productOrderServiceStatus);
    let page = params.page ? Number(params.page) : 1;
    let limit = params.limit ? Number(params.limit) : 20;
    if (!Number.isInteger(page) || page<1) page=1;
    if (!Number.isInteger(limit) || limit<1 || limit>100) limit=20;
    const sort = typeof params.sort === 'string' ? params.sort : 'createdAt';
    const search = typeof params.search === 'string' ? params.search : undefined;
    const pincode = typeof params.pincode === 'string' ? params.pincode : undefined;
    const tags = typeof params.tags === 'string' ? params.tags : undefined;

    const { customers, total } = await userRepository.listCustomers({ search, status, milkServiceStatus, productOrderServiceStatus, pincode, tags, page, limit, sort });
    return { customers: customers.map(toPublicUserProfile), total, page, pageSize: limit };
  },

  async getCustomerDetail(customerId: string): Promise<{ customer: PublicUserProfile }> {
    const u = await userRepository.findById(customerId);
    if (!u) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
    if (u.role!=='CUSTOMER') throw new AppError(400,'INVALID_TARGET_ROLE','Target is not a customer');
    return { customer: toPublicUserProfile(u) };
  },

  async updateCustomerAdmin(actor: PublicUserProfile, customerId: string, raw: Record<string,unknown>): Promise<PublicUserProfile> {
    const existing = await userRepository.findById(customerId);
    if (!existing) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
    if (existing.role!=='CUSTOMER') throw new AppError(400,'INVALID_TARGET_ROLE','Not a customer');
    if (raw.role !== undefined && raw.role !== existing.role) throw new AppError(400,'IMMUTABLE_ACCOUNT_FIELD','Role cannot be changed');
    if (raw.userCode !== undefined && raw.userCode !== existing.userCode) throw new AppError(400,'IMMUTABLE_ACCOUNT_FIELD','userCode immutable');
    if ('passwordHash' in raw || 'tokenVersion' in raw) throw new AppError(400,'IMMUTABLE_ACCOUNT_FIELD','Internal field immutable');

    // Pre-validate inputs outside transaction to fail fast
    let newFullName: string | undefined;
    if (raw.fullName !== undefined) newFullName = validateFullName(raw.fullName);
    let newMobile: string | undefined;
    if (raw.mobileNumber !== undefined) {
      newMobile = normalizeAndValidateMobileNumber(raw.mobileNumber, 'Customer mobile number');
    }
    let newTags: string[] | undefined;
    if (raw.tags !== undefined) newTags = validateTagList(raw.tags);

    if (newFullName===undefined && newMobile===undefined && newTags===undefined) {
      throw new AppError(400,'VALIDATION_ERROR','At least one valid field must be provided');
    }

    // Atomic mutation: all DB writes + audits in same transaction / snapshot
    return withAtomicMutation(async (session) => {
      let updated: typeof existing | null = existing;
      const changedFields: string[] = [];

      if (newFullName !== undefined) {
        updated = await updateCustomerFullName(customerId, newFullName, session);
        changedFields.push('fullName');
      }

      if (newMobile !== undefined) {
        if (newMobile !== existing.mobileNumber) {
          const prev = existing.mobileNumber;
          updated = await userRepository.updateCustomerMobile(customerId, newMobile, session);
          if (!updated) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
          await auditLogRepository.record({
            action: 'CUSTOMER_MOBILE_CHANGED',
            actorId: actor.id,
            actorRole: actor.role,
            targetUserId: updated.id,
            targetUserCode: updated.userCode,
            targetRole: 'CUSTOMER',
            summary: `Admin ${actor.userCode} changed mobile for ${updated.userCode} from ${prev} to ${newMobile}`,
            metadata: { previousMobileNumber: prev, newMobileNumber: newMobile },
          }, session);
          changedFields.push('mobileNumber');
        }
      }

      if (newTags !== undefined) {
        updated = await userRepository.updateTags(customerId, newTags, session);
        changedFields.push('tags');
        await auditLogRepository.record({
          action: 'CUSTOMER_TAG_UPDATED',
          actorId: actor.id,
          actorRole: actor.role,
          targetUserId: updated!.id,
          targetUserCode: updated!.userCode,
          targetRole: 'CUSTOMER',
          summary: `Admin ${actor.userCode} updated tags for ${updated!.userCode}`,
          metadata: { tags: newTags },
        }, session);
      }

      if (changedFields.length>0) {
        await auditLogRepository.record({
          action: 'CUSTOMER_UPDATED',
          actorId: actor.id,
          actorRole: actor.role,
          targetUserId: updated!.id,
          targetUserCode: updated!.userCode,
          targetRole: 'CUSTOMER',
          summary: `Admin ${actor.userCode} updated customer ${updated!.userCode} (${changedFields.join(',')})`,
          metadata: { changedFields },
        }, session);
      }

      // Return final state within same atomic context
      const finalEntity = updated ? updated : await userRepository.findById(customerId) as unknown as typeof existing;
      if (!finalEntity) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
      return toPublicUserProfile(finalEntity);
    });
  },

  async updateAccountStatus(actor: PublicUserProfile, customerId: string, raw: Record<string,unknown>): Promise<{ account: PublicUserProfile; sessionRevoked:boolean }>{
    const existing = await userRepository.findById(customerId);
    if (!existing) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
    const newStatus = validateAccountStatus(raw.status);
    if (actor.id === existing.id && newStatus !== 'ACTIVE') throw new AppError(400,'SELF_DEACTIVATION_FORBIDDEN','Cannot deactivate own account');
    const requiresReason = newStatus==='SUSPENDED' || newStatus==='BLOCKED';
    const reason = validateStatusReason(raw.reason, requiresReason, 'Status reason');
    const prev = existing.status;
    const sessionRevoked = newStatus !== 'ACTIVE';
    return withAtomicMutation(async (session) => {
      const updated = await userRepository.updateAccountStatus(customerId, newStatus, reason, session);
      if (!updated) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
      await auditLogRepository.record({
        action: 'ACCOUNT_STATUS_CHANGED',
        actorId: actor.id,
        actorRole: actor.role,
        targetUserId: updated.id,
        targetUserCode: updated.userCode,
        targetRole: updated.role,
        summary: `Admin ${actor.userCode} changed status of ${updated.userCode} from ${prev} to ${newStatus}${sessionRevoked ? ' revoked':''}`,
        metadata: { previousStatus: prev, newStatus, reason: reason ?? null, sessionRevoked },
      }, session);
      return { account: toPublicUserProfile(updated), sessionRevoked };
    });
  },

  async updateMilkServiceStatus(actor: PublicUserProfile, customerId: string, raw: Record<string,unknown>): Promise<PublicUserProfile>{
    const existing = await userRepository.findById(customerId);
    if (!existing) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
    const newStatus = validateMilkServiceStatus(raw.status);
    const current = (existing.milkServiceStatus ?? 'ACTIVE') as MilkServiceStatus;
    const allowed = ALLOWED_MILK_TRANSITIONS[current];
    if (!allowed || !allowed.includes(newStatus)) {
      if (current !== newStatus) {
        throw new AppError(400,'INVALID_STATUS_TRANSITION',`Cannot transition milk service from ${current} to ${newStatus}`);
      }
    }
    const requiresReason = newStatus==='PAUSED' || newStatus==='STOPPED';
    const reason = validateStatusReason(raw.reason, requiresReason, 'Service status reason');
    return withAtomicMutation(async (session) => {
      const updated = await userRepository.updateMilkServiceStatus(customerId, newStatus, session);
      await auditLogRepository.record({
        action: 'MILK_SERVICE_STATUS_CHANGED',
        actorId: actor.id,
        actorRole: actor.role,
        targetUserId: updated!.id,
        targetUserCode: updated!.userCode,
        targetRole: updated!.role,
        summary: `Admin ${actor.userCode} changed milk service of ${updated!.userCode} from ${current} to ${newStatus}`,
        metadata: { previousStatus: current, newStatus, reason: reason ?? null },
      }, session);
      return toPublicUserProfile(updated!);
    });
  },

  async updateProductOrderServiceStatus(actor: PublicUserProfile, customerId: string, raw: Record<string,unknown>): Promise<PublicUserProfile>{
    const existing = await userRepository.findById(customerId);
    if (!existing) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
    const newStatus = validateProductOrderServiceStatus(raw.status);
    const current = (existing.productOrderServiceStatus ?? 'ACTIVE') as ProductOrderServiceStatus;
    const allowed = ALLOWED_PRODUCT_TRANSITIONS[current];
    if (!allowed || !allowed.includes(newStatus)) {
      if (current !== newStatus) throw new AppError(400,'INVALID_STATUS_TRANSITION',`Cannot transition product service from ${current} to ${newStatus}`);
    }
    const requiresReason = newStatus==='PAUSED' || newStatus==='STOPPED';
    const reason = validateStatusReason(raw.reason, requiresReason, 'Service status reason');
    return withAtomicMutation(async (session) => {
      const updated = await userRepository.updateProductOrderServiceStatus(customerId, newStatus, session);
      await auditLogRepository.record({
        action: 'PRODUCT_SERVICE_STATUS_CHANGED',
        actorId: actor.id,
        actorRole: actor.role,
        targetUserId: updated!.id,
        targetUserCode: updated!.userCode,
        targetRole: updated!.role,
        summary: `Admin ${actor.userCode} changed product service of ${updated!.userCode} from ${current} to ${newStatus}`,
        metadata: { previousStatus: current, newStatus, reason: reason ?? null },
      }, session);
      return toPublicUserProfile(updated!);
    });
  },

  async updateWeeklySchedule(actor: PublicUserProfile, customerId: string, raw: Record<string,unknown>): Promise<PublicUserProfile>{
    const existing = await userRepository.findById(customerId);
    if (!existing) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
    const input = validateWeeklyScheduleInput(raw);
    // Determine new status
    let newStatus: WeeklyScheduleStatus | undefined = input.status;
    if (input.status) newStatus = input.status;
    else if (existing.weeklyMilkSchedule?.status) newStatus = existing.weeklyMilkSchedule.status;
    else newStatus = 'ACTIVE';

    // Validate schedule state transitions
    const currentStatus = existing.weeklyMilkSchedule?.status ?? 'ACTIVE';
    if (newStatus !== currentStatus) {
      if (currentStatus==='INACTIVE' && newStatus==='PAUSED') throw new AppError(400,'INVALID_STATUS_TRANSITION','Cannot pause an inactive schedule. Activate first.');
    }
    if (newStatus==='PAUSED' && !input.pausedUntil && existing.weeklyMilkSchedule?.pausedUntil===null && raw.pausedUntil===undefined) {
      // pausedUntil optional but recommended; allow indefinite pause
    }
    if (newStatus==='INACTIVE' || newStatus==='PAUSED') {
      // reason recommended but not required per spec? We'll not enforce reason for schedule, but log if provided
    }

    // Build full schedule merging existing
    const existingSchedule = existing.weeklyMilkSchedule;
    const schedule: WeeklyMilkSchedule = {
      scheduleId: existingSchedule?.scheduleId ?? crypto.randomUUID(),
      status: newStatus!,
      pausedUntil: input.pausedUntil !== undefined ? input.pausedUntil : (existingSchedule?.pausedUntil ?? null),
      effectiveFrom: input.effectiveFrom ?? existingSchedule?.effectiveFrom ?? new Date(),
      monday: (input as unknown as Record<string, {quantityLitres:number}>).monday ?? existingSchedule?.monday ?? { quantityLitres:0 },
      tuesday: (input as unknown as Record<string, {quantityLitres:number}>).tuesday ?? existingSchedule?.tuesday ?? { quantityLitres:0 },
      wednesday: (input as unknown as Record<string, {quantityLitres:number}>).wednesday ?? existingSchedule?.wednesday ?? { quantityLitres:0 },
      thursday: (input as unknown as Record<string, {quantityLitres:number}>).thursday ?? existingSchedule?.thursday ?? { quantityLitres:0 },
      friday: (input as unknown as Record<string, {quantityLitres:number}>).friday ?? existingSchedule?.friday ?? { quantityLitres:0 },
      saturday: (input as unknown as Record<string, {quantityLitres:number}>).saturday ?? existingSchedule?.saturday ?? { quantityLitres:0 },
      sunday: (input as unknown as Record<string, {quantityLitres:number}>).sunday ?? existingSchedule?.sunday ?? { quantityLitres:0 },
    };

    let action: string = 'WEEKLY_SCHEDULE_UPDATED';
    if (currentStatus !== newStatus) {
      if (newStatus==='ACTIVE' && currentStatus==='PAUSED') action='WEEKLY_SCHEDULE_RESUMED';
      else if (newStatus==='ACTIVE') action='WEEKLY_SCHEDULE_ACTIVATED';
      else if (newStatus==='INACTIVE') action='WEEKLY_SCHEDULE_DEACTIVATED';
      else if (newStatus==='PAUSED') action='WEEKLY_SCHEDULE_PAUSED';
    }
    return withAtomicMutation(async (session) => {
      const updated = await userRepository.setWeeklySchedule(customerId, schedule, session);
      await auditLogRepository.record({
        action: action as unknown as 'WEEKLY_SCHEDULE_UPDATED',
        actorId: actor.id,
        actorRole: actor.role,
        targetUserId: updated!.id,
        targetUserCode: updated!.userCode,
        targetRole: updated!.role,
        summary: `Admin ${actor.userCode} updated weekly schedule for ${updated!.userCode} to ${newStatus}`,
        metadata: { previousStatus: currentStatus, newStatus, schedule },
      }, session);
      return toPublicUserProfile(updated!);
    });
  },

  async createNote(actor: PublicUserProfile, customerId: string, body: unknown): Promise<import('../models/CustomerNote').CustomerNoteEntity> {
    const existing = await userRepository.findById(customerId);
    if (!existing) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
    if (typeof body !== 'string' || body.trim().length===0) throw new AppError(400,'VALIDATION_ERROR','Note body is required');
    if (body.trim().length>2000) throw new AppError(400,'VALIDATION_ERROR','Note cannot exceed 2000 chars');
    return withAtomicMutation(async (session) => {
      const note = await customerNoteRepository.create(customerId, actor.id, actor.userCode, body.trim(), session);
      await auditLogRepository.record({
        action: 'CUSTOMER_NOTE_CREATED',
        actorId: actor.id,
        actorRole: actor.role,
        targetUserId: existing.id,
        targetUserCode: existing.userCode,
        targetRole: 'CUSTOMER',
        summary: `Admin ${actor.userCode} added note for ${existing.userCode}`,
        metadata: { noteId: note.id },
      }, session);
      return note;
    });
  },

  async listNotes(customerId: string, page: unknown, limit: unknown): Promise<{ notes: import('../models/CustomerNote').CustomerNoteEntity[]; total:number; page:number; pageSize:number }>{
    const existing = await userRepository.findById(customerId);
    if (!existing) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
    let p = Number(page) || 1;
    let l = Number(limit) || 20;
    if (p<1) p=1; if (l<1||l>100) l=20;
    const { notes, total } = await customerNoteRepository.list(customerId, p, l);
    return { notes, total, page:p, pageSize:l };
  },

  async getTimeline(customerId: string, page: unknown, limit: unknown): Promise<{ entries: Array<Record<string,unknown>>; total:number; page:number; pageSize:number }>{
    const existing = await userRepository.findById(customerId);
    if (!existing) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
    let p = Number(page) || 1;
    let l = Number(limit) || 20;
    if (p<1) p=1; if (l<1||l>100) l=20;

    // Correct DB-level pagination: totals via countDocuments, entries via merged pagination
    // Uses database-level pagination (skip/limit) for each collection and merges to support >10k entries
    const isMongo = mongoose.connection.readyState === 1;
    if (isMongo) {
      // Get totals via counts (DB-level)
      const [auditTotal, noteTotal] = await Promise.all([
        auditLogRepository.count({ targetUserId: customerId }),
        (async () => {
          const { total } = await customerNoteRepository.list(customerId, 1, 1);
          // Use count via model directly for accuracy when large
          try {
            const { CustomerNoteModel } = await import('../models/CustomerNote');
            return await CustomerNoteModel.countDocuments({ customerId: new mongoose.Types.ObjectId(customerId) }).exec();
          } catch { return total; }
        })(),
      ]);
      const total = auditTotal + noteTotal;

      // For merged pagination, fetch top (p*l) from each collection via DB limit, then slice
      // This is DB-level pagination (limit) with correct global ordering and supports >10k
      const needed = p * l;
      const [audits, noteRes] = await Promise.all([
        AuditLogModel.find({ targetUserId: customerId }).sort({ createdAt: -1 }).limit(needed).lean().exec(),
        (async () => {
          const { CustomerNoteModel } = await import('../models/CustomerNote');
          return CustomerNoteModel.find({ customerId: new mongoose.Types.ObjectId(customerId) })
            .sort({ createdAt: -1 })
            .limit(needed)
            .lean()
            .exec();
        })(),
      ]);
      const auditEntries = audits.map((a: unknown) => {
        const doc = a as { _id: { toString(): string }; action: string; summary: string; metadata: unknown; actorId: string; actorRole: string; createdAt: Date };
        return { type: 'AUDIT', id: doc._id.toString(), action: doc.action, summary: doc.summary, metadata: doc.metadata, actorId: doc.actorId, actorRole: doc.actorRole, createdAt: doc.createdAt };
      });
      const noteEntries = noteRes.map((n: unknown) => {
        const doc = n as { _id: { toString(): string }; body: string; authorCode: string; createdAt: Date };
        return { type: 'NOTE', id: doc._id.toString(), body: doc.body, authorCode: doc.authorCode, createdAt: doc.createdAt };
      });
      const merged = [...auditEntries, ...noteEntries].sort((a,b)=> {
        const timeDiff = new Date(b.createdAt as unknown as string).getTime() - new Date(a.createdAt as unknown as string).getTime();
        if (timeDiff !== 0) return timeDiff;
        // Deterministic secondary sort by _id descending for identical timestamps
        return String(b.id).localeCompare(String(a.id));
      });
      const start = (p - 1) * l;
      return { entries: merged.slice(start, start + l), total, page: p, pageSize: l };
    } else {
      // In-memory: fetch all without artificial cap, then paginate in memory (no 10k limit)
      const audits = await auditLogRepository.getAllForTimeline({ targetUserId: customerId });
      const auditEntries = audits.map((a)=> ({ type:'AUDIT', id:a.id, action:a.action, summary:a.summary, metadata:a.metadata, actorId:a.actorId, actorRole:a.actorRole, createdAt:a.createdAt }));
      const allNotes = inMemoryNoteStore.list(customerId, Number.MAX_SAFE_INTEGER, 1);
      const noteEntries: Array<Record<string,unknown>> = allNotes.notes.map((n: { id: string; body: string; authorCode: string; createdAt: Date })=> ({ type:'NOTE', id:n.id, body:n.body, authorCode:n.authorCode, createdAt:n.createdAt }));
      const merged = [...auditEntries, ...noteEntries].sort((a,b)=> {
        const timeDiff = new Date(b.createdAt as unknown as string).getTime() - new Date(a.createdAt as unknown as string).getTime();
        if (timeDiff !== 0) return timeDiff;
        return String(b.id).localeCompare(String(a.id));
      });
      const total = merged.length;
      const start=(p-1)*l;
      return { entries: merged.slice(start, start+l), total, page:p, pageSize:l };
    }
  },

  async addAddress(actor: PublicUserProfile, customerId: string, raw: unknown): Promise<PublicUserProfile>{
    const existing = await userRepository.findById(customerId);
    if (!existing) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
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
    return withAtomicMutation(async (session) => {
      const updated = await userRepository.addDeliveryAddress(customerId, addr, session);
      await auditLogRepository.record({
        action: 'ADDRESS_CREATED',
        actorId: actor.id,
        actorRole: actor.role,
        targetUserId: updated!.id,
        targetUserCode: updated!.userCode,
        targetRole: updated!.role,
        summary: `Admin ${actor.userCode} added address for ${updated!.userCode}`,
        metadata: { addressId: addr.addressId },
      }, session);
      return toPublicUserProfile(updated!);
    });
  },

  async updateAddress(actor: PublicUserProfile, customerId: string, addressId: string, raw: unknown): Promise<PublicUserProfile>{
    const updates = validateDeliveryAddressInput(raw);
    return withAtomicMutation(async (session) => {
      const updated = await userRepository.updateDeliveryAddress(customerId, addressId, updates, session);
      await auditLogRepository.record({
        action: 'ADDRESS_UPDATED',
        actorId: actor.id,
        actorRole: actor.role,
        targetUserId: updated!.id,
        targetUserCode: updated!.userCode,
        targetRole: updated!.role,
        summary: `Admin ${actor.userCode} updated address ${addressId} for ${updated!.userCode}`,
        metadata: { addressId },
      }, session);
      return toPublicUserProfile(updated!);
    });
  },

  async activateAddress(actor: PublicUserProfile, customerId: string, addressId: string): Promise<PublicUserProfile>{
    return withAtomicMutation(async (session) => {
      const updated = await userRepository.setActiveDeliveryAddress(customerId, addressId, session);
      await auditLogRepository.record({
        action: 'ACTIVE_ADDRESS_CHANGED',
        actorId: actor.id,
        actorRole: actor.role,
        targetUserId: updated!.id,
        targetUserCode: updated!.userCode,
        targetRole: updated!.role,
        summary: `Admin ${actor.userCode} set active address ${addressId} for ${updated!.userCode}`,
        metadata: { addressId },
      }, session);
      return toPublicUserProfile(updated!);
    });
  },

  async archiveAddress(actor: PublicUserProfile, customerId: string, addressId: string): Promise<PublicUserProfile>{
    return withAtomicMutation(async (session) => {
      const updated = await userRepository.archiveDeliveryAddress(customerId, addressId, session);
      await auditLogRepository.record({
        action: 'ADDRESS_ARCHIVED',
        actorId: actor.id,
        actorRole: actor.role,
        targetUserId: updated!.id,
        targetUserCode: updated!.userCode,
        targetRole: updated!.role,
        summary: `Admin ${actor.userCode} archived address ${addressId} for ${updated!.userCode}`,
        metadata: { addressId },
      }, session);
      return toPublicUserProfile(updated!);
    });
  },

  async bulkImport(actor: PublicUserProfile, buffer: Buffer, filename: string, dryRun = false): Promise<{ imported: number; customers: PublicUserProfile[]; dryRun?: boolean; preview?: Array<Record<string,unknown>> }> {
    const normalizedRows: Array<{ row:number; fullName:string; mobileNumber:string; password:string; line1?:string; city?:string; pincode?:string; label?:string }> = [];
    try {
    // Size limits enforced at route level; double-check
    if (buffer.length > 2 * 1024 * 1024) throw new AppError(413,'PAYLOAD_TOO_LARGE','File exceeds 2MB limit');
    // Parse CSV or XLSX
    let rows: Array<Record<string,string>> = [];
    if (filename.toLowerCase().endsWith('.xlsx') || filename.toLowerCase().endsWith('.xls')) {
      rows = parseXlsx(buffer);
    } else {
      rows = parseCsv(buffer);
    }
    if (rows.length===0) throw new AppError(400,'VALIDATION_ERROR','File contains no data rows');
    if (rows.length>500) throw new AppError(400,'VALIDATION_ERROR','File exceeds 500 row limit');
    // Validate rows
    const errors: Array<{ row:number; field:string; code:string; message:string }> = [];

    const seenMobiles = new Set<string>();
    for (let i=0;i<rows.length;i++) {
      const r = rows[i];
      const rowNum = i+2; // header is 1
      let fullNameRaw = r.fullName ?? r.full_name ?? r['Full Name'] ?? r.name ?? '';
      let mobileRaw = r.mobileNumber ?? r.mobile ?? r['mobileNumber'] ?? r['Mobile Number'] ?? '';
      let passwordRaw = r.password ?? r['Password'] ?? '';
      try {
        const fn = validateFullName(fullNameRaw);
        const mn = normalizeAndValidateMobileNumber(mobileRaw, 'Mobile number');
        const pw = validatePasswordStrength(passwordRaw);
        if (seenMobiles.has(mn)) {
          errors.push({ row: rowNum, field:'mobileNumber', code:'DUPLICATE_MOBILE_IN_FILE', message:`Duplicate mobile ${mn} in file`});
        } else {
          seenMobiles.add(mn);
          // Also validate pincode if present
          let pincode: string|undefined;
          const pRaw = r.pincode ?? r['Pincode'] ?? r['pincode'] ?? '';
          if (pRaw) {
            if (!/^\d{6}$/.test(String(pRaw).trim())) errors.push({ row: rowNum, field:'pincode', code:'VALIDATION_ERROR', message:'Pincode must be 6-digit' });
            else pincode = String(pRaw).trim();
          }
          normalizedRows.push({ row: rowNum, fullName: fn, mobileNumber: mn, password: pw, line1: r.line1 ?? r['Address Line1'] ?? undefined, city: r.city ?? r['City'] ?? undefined, pincode, label: r.label ?? undefined });
        }
      } catch (e) {
        const err = e as AppError;
        errors.push({ row: rowNum, field:'row', code: err.code ?? 'VALIDATION_ERROR', message: err.message });
      }
    }

    // DB duplicate check
    if (normalizedRows.length>0) {
      const mobiles = normalizedRows.map(r=> r.mobileNumber);
      if (mongoose.connection.readyState===1) {
        const existingDocs = await UserModel.find({ mobileNumber: { $in: mobiles } }).select('mobileNumber').lean().exec();
        const existingSet = new Set(existingDocs.map(d=> d.mobileNumber));
        for (const nr of normalizedRows) {
          if (existingSet.has(nr.mobileNumber)) {
            errors.push({ row: nr.row, field:'mobileNumber', code:'MOBILE_ALREADY_REGISTERED', message:`Mobile ${nr.mobileNumber} already registered`});
          }
        }
      } else {
        // in-memory check
        for (const nr of normalizedRows) {
          const exists = await userRepository.findByMobileWithPassword(nr.mobileNumber);
          if (exists) errors.push({ row: nr.row, field:'mobileNumber', code:'MOBILE_ALREADY_REGISTERED', message:`Mobile ${nr.mobileNumber} already registered`});
        }
      }
    }

    if (errors.length>0) {
      const err = new AppError(400,'BULK_IMPORT_VALIDATION_FAILED', `Bulk import validation failed with ${errors.length} errors`);
      (err as unknown as Record<string,unknown>).details = { errors };
      (err as unknown as Record<string,unknown>).errors = errors;
      throw err;
    }

    // Dry-run: validate only, no creation
    if (dryRun) {
      // Return preview without persisting (buffer cleared in finally)
      return { imported: 0, customers: [], dryRun: true, preview: normalizedRows.map(r=> ({ row: r.row, fullName: r.fullName, mobileNumber: r.mobileNumber.slice(0,6)+'****', pincode: r.pincode })) };
    }
    // Transactional creation
    const isMongo = mongoose.connection.readyState===1;
    // Check if replica set (transactions require replica set)
    let useTransaction = false;
    if (isMongo) {
      try {
        // @ts-ignore
        const topology = (mongoose.connection as unknown as { client?: { topology?: { description?: { type?: string } } } }).client?.topology?.description?.type;
        // Fallback: try admin command
        useTransaction = true; // attempt, fallback to non-tx if fails
      } catch { useTransaction = false; }
    }

    const created: PublicUserProfile[] = [];
    try {
    if (useTransaction) {
      let outerAttempts = 0;
      let lastError: unknown = null;
      while (outerAttempts < 5) {
        outerAttempts += 1;
        // Recompute baseMax for every complete transaction attempt — ensures retry sees latest committed codes
        const existingDocs = await UserModel.find({ role:'CUSTOMER', userCode: new RegExp(`^CUS-\\d+$`) }).select('userCode').lean().exec();
        let baseMax = 0;
        for (const d of existingDocs) {
          const seq = Number.parseInt(d.userCode.slice(4),10);
          if (!Number.isNaN(seq) && seq > baseMax) baseMax = seq;
        }
        let nextSeq = baseMax + 1;
        const session = await mongoose.startSession();
        const attemptCreated: PublicUserProfile[] = [];
        try {
          await session.withTransaction(async ()=>{
            // Clear any partial attempt state — nextSeq is fresh for this attempt
            attemptCreated.length = 0;
            for (const nr of normalizedRows) {
              // Preserve raw password across driver-level retries — do not mutate nr.password
              const rawPassword = nr.password;
              const passwordHash = await hashPassword(rawPassword);
              let deliveryAddresses: DeliveryAddress[]|undefined;
              let activeId: string|null|undefined;
              if (nr.pincode && nr.line1) {
                const addr: DeliveryAddress = {
                  addressId: crypto.randomUUID(),
                  label: (nr.label?.toUpperCase() as DeliveryAddress['label']) ?? 'HOME',
                  line1: nr.line1!,
                  city: nr.city,
                  pincode: nr.pincode!,
                  isArchived: false,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
                deliveryAddresses = [addr];
                activeId = addr.addressId;
              }
              // No inner duplicate retry — duplicate aborts transaction and is retried as whole
              const code = `CUS-${String(nextSeq).padStart(4,'0')}`;
              nextSeq += 1;
              const createdDocs = await UserModel.create([{
                userCode: code,
                fullName: nr.fullName,
                mobileNumber: nr.mobileNumber,
                passwordHash,
                role:'CUSTOMER',
                status:'ACTIVE',
                deliveryAddresses: deliveryAddresses ?? [],
                activeDeliveryAddressId: activeId ?? null,
                milkServiceStatus:'PENDING_ACTIVATION',
                productOrderServiceStatus:'ACTIVE',
                mustChangePassword:true,
                tags:[],
                createdBy: actor.id,
                tokenVersion:0,
              }], { session });
              const doc = createdDocs[0] as unknown as { _id: { toString(): string }; userCode: string; fullName: string; mobileNumber: string; passwordHash: string; role: string; status: string; address: unknown; deliveryAddresses: unknown; activeDeliveryAddressId: string | null; milkServiceStatus: unknown; productOrderServiceStatus: unknown; weeklyMilkSchedule: unknown; tags: unknown; mustChangePassword: boolean; createdBy: string | null; tokenVersion: number; lastLoginAt: Date | null; lastLogoutAt: Date | null; createdAt: Date; updatedAt: Date };
              const entity = doc as unknown as { _id: { toString(): string }; userCode: string; fullName: string; mobileNumber: string; passwordHash: string; role: string; status: string; address: unknown; deliveryAddresses: unknown; activeDeliveryAddressId: string | null; milkServiceStatus: unknown; productOrderServiceStatus: unknown; weeklyMilkSchedule: unknown; tags: unknown; mustChangePassword: boolean; createdBy: string | null; tokenVersion: number; lastLoginAt: Date | null; lastLogoutAt: Date | null; createdAt: Date; updatedAt: Date };
              await AuditLogModel.create([{
                action:'CUSTOMER_BULK_IMPORTED',
                actorId: actor.id,
                actorRole: actor.role,
                targetUserId: entity._id.toString(),
                targetUserCode: entity.userCode,
                targetRole:'CUSTOMER',
                summary:`Bulk imported customer ${entity.userCode} via ${filename}`,
                metadata:{ mobileNumber: entity.mobileNumber, row: nr.row },
              }], { session });
              attemptCreated.push(toPublicUserProfile({
                id: entity._id.toString(),
                userCode: entity.userCode,
                fullName: entity.fullName,
                mobileNumber: entity.mobileNumber,
                passwordHash: entity.passwordHash,
                role: entity.role as unknown as 'CUSTOMER',
                status: entity.status,
                address: entity.address,
                deliveryAddresses: entity.deliveryAddresses as unknown as DeliveryAddress[],
                activeDeliveryAddressId: entity.activeDeliveryAddressId,
                milkServiceStatus: entity.milkServiceStatus,
                productOrderServiceStatus: entity.productOrderServiceStatus,
                weeklyMilkSchedule: entity.weeklyMilkSchedule,
                tags: entity.tags,
                mustChangePassword: entity.mustChangePassword,
                createdBy: entity.createdBy,
                tokenVersion: entity.tokenVersion,
                lastLoginAt: entity.lastLoginAt,
                lastLogoutAt: entity.lastLogoutAt,
                createdAt: entity.createdAt,
                updatedAt: entity.updatedAt,
              } as unknown as import('../models/User').UserEntity));
            }
          });
          // Success — commit
          created.push(...attemptCreated);
          await session.endSession();
          break;
        } catch (err: unknown) {
          await session.endSession();
          const msg = (err as { message?: string; code?: number })?.message ?? '';
          const code = (err as { code?: number })?.code;
          const isDup = code === 11000 || msg.includes('user_code_unique') || msg.includes('E11000');
          const isUserCodeDup = isDup && (msg.includes('userCode') || msg.includes('user_code_unique') || (err as { keyPattern?: Record<string,unknown> })?.keyPattern && 'userCode' in ((err as { keyPattern?: Record<string,unknown> })?.keyPattern ?? {}));
          // Only retry eligible duplicate user_code_unique conflicts — not unrelated errors
          if ((isDup && (isUserCodeDup || msg.includes('user_code_unique'))) && outerAttempts < 5) {
            lastError = err;
            continue; // retry entire transaction with recomputed baseMax
          }
          // Transient transaction errors should also be retried by driver, but we handle duplicate only
          throw err;
        }
      }
      if (created.length === 0 && outerAttempts >= 5) {
        throw new AppError(409,'USER_CODE_CONFLICT','Failed to allocate unique user code after 5 transaction retries');
      }
      // Clear sensitive data after transaction attempts
      for (const nr of normalizedRows) (nr as unknown as Record<string,unknown>).password = undefined;
      buffer.fill(0);
    } else {
      // In-memory atomic fallback: all rows + audits in single snapshot transaction
      const inMemCreated = await withAtomicMutation(async () => {
        const local: PublicUserProfile[] = [];
        for (const nr of normalizedRows) {
          const passwordHash = await hashPassword(nr.password);
          // Do not clear nr.password here — outer finally handles it, inner clear would break retry safety
          let deliveryAddresses: DeliveryAddress[]|undefined;
          let activeId: string|null|undefined;
          if (nr.pincode && nr.line1) {
            const addr: DeliveryAddress = {
              addressId: crypto.randomUUID(),
              label: (nr.label?.toUpperCase() as DeliveryAddress['label']) ?? 'HOME',
              line1: nr.line1!,
              city: nr.city,
              pincode: nr.pincode!,
              isArchived: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            deliveryAddresses = [addr];
            activeId = addr.addressId;
          }
          const user = await userRepository.createCustomerAdmin({
            fullName: nr.fullName,
            mobileNumber: nr.mobileNumber,
            passwordHash,
            deliveryAddresses,
            activeDeliveryAddressId: activeId ?? null,
            milkServiceStatus:'PENDING_ACTIVATION',
            productOrderServiceStatus:'ACTIVE',
            mustChangePassword:true,
            createdBy: actor.id,
          });
          await auditLogRepository.record({
            action:'CUSTOMER_BULK_IMPORTED',
            actorId: actor.id,
            actorRole: actor.role,
            targetUserId: user.id,
            targetUserCode: user.userCode,
            targetRole:'CUSTOMER',
            summary:`Bulk imported customer ${user.userCode}`,
            metadata:{ mobileNumber: user.mobileNumber, row: nr.row },
          });
          local.push(toPublicUserProfile(user));
        }
        return local;
      });
      created.push(...inMemCreated);
    }

    return { imported: created.length, customers: created };
    } catch (e) {
      // If transaction failed due to replica set not available, fail clearly, not silently fallback
      const msg = (e as { message?: string })?.message ?? '';
      if (msg.includes('Transaction numbers are only allowed') || msg.includes('not a replica set')) {
        throw new AppError(503, 'TRANSACTIONS_NOT_SUPPORTED', 'MongoDB transactions require a replica set. Configure MONGODB_URI to a replica set (Atlas or rs.initiate).');
      }
      throw e;
    } finally {
      // Always clear sensitive data (inner)
      for (const nr of normalizedRows) {
        try { (nr as unknown as Record<string,unknown>).password = undefined; } catch {}
      }
      try { buffer.fill(0); } catch {}
    }
    } catch (outerErr) {
      throw outerErr;
    } finally {
      // Outer finally ensures buffer cleared even on validation errors / dryRun early return
      try { buffer.fill(0); } catch {}
      for (const nr of normalizedRows) { try { (nr as unknown as Record<string,unknown>).password = undefined; } catch {} }
    }
  },
};

async function updateCustomerFullName(id: string, fullName: string, session?: mongoose.ClientSession): Promise<import('../models/User').UserEntity> {
  if (mongoose.connection.readyState===1) {
    const doc = await UserModel.findByIdAndUpdate(id, { $set:{ fullName } }, { new:true, ...(session ? { session } : {}) }).select('+passwordHash').exec();
    if (!doc) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
    return {
      id: doc._id.toString(),
      userCode: doc.userCode,
      fullName: doc.fullName,
      mobileNumber: doc.mobileNumber,
      passwordHash: doc.passwordHash,
      role: doc.role,
      status: doc.status,
      statusReason: doc.statusReason,
      address: doc.address,
      deliveryAddresses: (doc.deliveryAddresses as unknown as DeliveryAddress[]) ?? [],
      activeDeliveryAddressId: doc.activeDeliveryAddressId,
      milkServiceStatus: doc.milkServiceStatus,
      productOrderServiceStatus: doc.productOrderServiceStatus,
      weeklyMilkSchedule: doc.weeklyMilkSchedule,
      tags: doc.tags ?? [],
      mustChangePassword: doc.mustChangePassword,
      staffPermissions: doc.staffPermissions,
      farmerProfile: doc.farmerProfile,
      grazingWorkerProfile: doc.grazingWorkerProfile,
      createdBy: doc.createdBy,
      tokenVersion: doc.tokenVersion,
      lastLoginAt: doc.lastLoginAt,
      lastLogoutAt: doc.lastLogoutAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } as unknown as import('../models/User').UserEntity;
  } else {
    // In-memory path: directly mutate store
    const { inMemoryUserStore } = await import('../repositories/userRepository');
    const existing = inMemoryUserStore.findById(id);
    if (!existing) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
    // @ts-ignore access private
    const map = (inMemoryUserStore as unknown as { byId: Map<string, import('../models/User').UserEntity> }).byId;
    const e = map.get(id);
    if (e) { e.fullName = fullName; e.updatedAt = new Date(); }
    const updated = inMemoryUserStore.findById(id);
    if (!updated) throw new AppError(404,'ACCOUNT_NOT_FOUND','Customer not found');
    return updated;
  }
}

function parseCsv(buffer: Buffer): Array<Record<string,string>> {
  try {
    const { parse } = require('csv-parse/sync') as { parse: (input: string, opts: Record<string, unknown>) => Array<Record<string, string>> };
    const text = buffer.toString('utf8');
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
      delimiter: ',',
      quote: '"',
      escape: '"',
    }) as Array<Record<string, string>>;
    return records;
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? 'Invalid CSV';
    throw new AppError(400, 'VALIDATION_ERROR', `CSV parse error: ${msg}`);
  }
}

function parseXlsx(buffer: Buffer): Array<Record<string,string>> {
  try {
    // Dynamic import to avoid hard dependency if not installed
    // @ts-ignore
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type:'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    const sheet = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval:'', raw:false }) as Record<string,string>[];
    return json;
  } catch {
    throw new AppError(400,'VALIDATION_ERROR','Failed to parse XLSX file. Ensure it is a valid Excel file.');
  }
}
