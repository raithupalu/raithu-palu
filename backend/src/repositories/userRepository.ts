import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import {
  UserModel,
  UserEntity,
  IUserDocument,
  UserRole,
  ManagedUserRole,
  UserStatus,
  CustomerAddress,
  StaffPermission,
  FarmerProfile,
  GrazingWorkerProfile,
  ROLE_ID_PREFIX,
} from '../models/User';
import { env } from '../config/env';
import { AppError } from '../middleware/notFound';

export interface CreateCustomerInput {
  fullName: string;
  mobileNumber: string;
  passwordHash: string;
  address?: CustomerAddress;
}

export interface UpdateCustomerProfileInput {
  fullName?: string;
  address?: CustomerAddress;
}

export interface ProvisionAdminInput {
  fullName: string;
  mobileNumber: string;
  passwordHash: string;
}

export interface CreateManagedAccountInput {
  fullName: string;
  mobileNumber: string;
  passwordHash: string;
  role: ManagedUserRole;
  status?: UserStatus;
  staffPermissions?: StaffPermission[];
  farmerProfile?: FarmerProfile;
  grazingWorkerProfile?: GrazingWorkerProfile;
  createdBy: string;
}

export interface UpdateManagedAccountInput {
  fullName?: string;
  mobileNumber?: string;
  passwordHash?: string;
  staffPermissions?: StaffPermission[];
  farmerProfile?: FarmerProfile;
  grazingWorkerProfile?: GrazingWorkerProfile;
  address?: CustomerAddress;
}

export interface ListAccountsFilter {
  role?: UserRole | 'ALL_MANAGED';
  status?: UserStatus;
  search?: string;
}

function formatUserCode(role: UserRole, sequenceNumber: number): string {
  const prefix = ROLE_ID_PREFIX[role];
  return `${prefix}-${String(sequenceNumber).padStart(4, '0')}`;
}

function parseSequenceFromUserCode(userCode: string | undefined, role: UserRole): number {
  if (!userCode) return 0;
  const prefix = `${ROLE_ID_PREFIX[role]}-`;
  if (!userCode.startsWith(prefix)) return 0;
  const numericPart = Number.parseInt(userCode.slice(prefix.length), 10);
  return Number.isFinite(numericPart) ? numericPart : 0;
}

function mapDocToEntity(doc: IUserDocument): UserEntity {
  const role = doc.role;
  const fallbackCode = `${ROLE_ID_PREFIX[role]}-0001`;
  return {
    id: doc._id.toString(),
    userCode: doc.userCode || fallbackCode,
    fullName: doc.fullName,
    mobileNumber: doc.mobileNumber,
    passwordHash: doc.passwordHash,
    role: doc.role,
    status: doc.status,
    statusReason: doc.statusReason,
    address: doc.address
      ? {
          line1: doc.address.line1,
          line2: doc.address.line2,
          landmark: doc.address.landmark,
          city: doc.address.city,
          pincode: doc.address.pincode,
          deliveryNotes: doc.address.deliveryNotes,
        }
      : undefined,
    staffPermissions:
      doc.role === 'STAFF'
        ? [...(doc.staffPermissions ?? [])]
        : undefined,
    farmerProfile:
      doc.role === 'FARMER' && doc.farmerProfile
        ? {
            businessContactMobile: doc.farmerProfile.businessContactMobile,
            villageOrLocation: doc.farmerProfile.villageOrLocation,
            suppliedMilkTypes: [...(doc.farmerProfile.suppliedMilkTypes ?? ['BUFFALO'])],
          }
        : undefined,
    grazingWorkerProfile:
      doc.role === 'GRAZING_WORKER' && doc.grazingWorkerProfile
        ? {
            emergencyContactMobile: doc.grazingWorkerProfile.emergencyContactMobile,
            assignedNotes: doc.grazingWorkerProfile.assignedNotes,
          }
        : undefined,
    createdBy: doc.createdBy ?? null,
    tokenVersion: doc.tokenVersion ?? 0,
    lastLoginAt: doc.lastLoginAt ?? null,
    lastLogoutAt: doc.lastLogoutAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function cloneEntity(entity: UserEntity): UserEntity {
  return {
    ...entity,
    address: entity.address ? { ...entity.address } : undefined,
    staffPermissions: entity.staffPermissions
      ? [...entity.staffPermissions]
      : undefined,
    farmerProfile: entity.farmerProfile
      ? {
          ...entity.farmerProfile,
          suppliedMilkTypes: [...entity.farmerProfile.suppliedMilkTypes],
        }
      : undefined,
    grazingWorkerProfile: entity.grazingWorkerProfile
      ? { ...entity.grazingWorkerProfile }
      : undefined,
  };
}

interface SerializedUserEntity
  extends Omit<
    UserEntity,
    'lastLoginAt' | 'lastLogoutAt' | 'createdAt' | 'updatedAt' | 'userCode'
  > {
  userCode?: string;
  lastLoginAt: string | null;
  lastLogoutAt: string | null;
  createdAt: string;
  updatedAt: string;
}

class InMemoryUserStore {
  private byId = new Map<string, UserEntity>();
  private byMobile = new Map<string, string>();
  private readonly persistFilePath: string;

  constructor() {
    const dataDir = path.resolve(process.cwd(), '.data');
    this.persistFilePath = path.join(dataDir, 'dev-users.json');
    this.loadFromDisk();
  }

  private isDiskPersistenceEnabled(): boolean {
    return (
      process.env.NODE_ENV !== 'test' &&
      env.NODE_ENV === 'development' &&
      env.ALLOW_IN_MEMORY_AUTH_FALLBACK
    );
  }

  private nextUserCodeForRole(role: UserRole): string {
    let maxSeq = 0;
    for (const user of this.byId.values()) {
      if (user.role === role) {
        const seq = parseSequenceFromUserCode(user.userCode, role);
        if (seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
    return formatUserCode(role, maxSeq + 1);
  }

  private loadFromDisk(): void {
    if (!this.isDiskPersistenceEnabled()) {
      return;
    }
    if (!fs.existsSync(this.persistFilePath)) {
      return;
    }
    try {
      const raw = fs.readFileSync(this.persistFilePath, 'utf8');
      const items = JSON.parse(raw) as SerializedUserEntity[];
      this.byId.clear();
      this.byMobile.clear();
      let migrated = false;
      for (const item of items) {
        const role: UserRole = item.role || 'CUSTOMER';
        let userCode = item.userCode;
        if (!userCode) {
          userCode = this.nextUserCodeForRole(role);
          migrated = true;
        }
        const entity: UserEntity = {
          ...item,
          role,
          userCode,
          lastLoginAt: item.lastLoginAt ? new Date(item.lastLoginAt) : null,
          lastLogoutAt: item.lastLogoutAt ? new Date(item.lastLogoutAt) : null,
          createdAt: new Date(item.createdAt),
          updatedAt: new Date(item.updatedAt),
        };
        this.byId.set(entity.id, entity);
        this.byMobile.set(entity.mobileNumber, entity.id);
      }
      if (migrated) {
        this.saveToDisk();
      }
    } catch {
      // Ignore corrupt dev cache file
    }
  }

  private saveToDisk(): void {
    if (!this.isDiskPersistenceEnabled()) {
      return;
    }
    try {
      const dir = path.dirname(this.persistFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const serialized: SerializedUserEntity[] = Array.from(
        this.byId.values()
      ).map((u) => ({
        ...u,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        lastLogoutAt: u.lastLogoutAt ? u.lastLogoutAt.toISOString() : null,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      }));
      fs.writeFileSync(
        this.persistFilePath,
        JSON.stringify(serialized, null, 2),
        'utf8'
      );
    } catch {
      // Ignore disk write errors in restricted environments
    }
  }

  public findByMobile(mobileNumber: string): UserEntity | null {
    this.loadFromDisk();
    const id = this.byMobile.get(mobileNumber);
    if (!id) return null;
    const entity = this.byId.get(id);
    return entity ? cloneEntity(entity) : null;
  }

  public findById(id: string): UserEntity | null {
    this.loadFromDisk();
    const entity = this.byId.get(id);
    return entity ? cloneEntity(entity) : null;
  }

  public findByUserCode(userCode: string): UserEntity | null {
    this.loadFromDisk();
    const normalized = userCode.trim().toUpperCase();
    for (const entity of this.byId.values()) {
      if (entity.userCode.toUpperCase() === normalized) {
        return cloneEntity(entity);
      }
    }
    return null;
  }

  public createCustomer(input: CreateCustomerInput): UserEntity {
    this.loadFromDisk();
    if (this.byMobile.has(input.mobileNumber)) {
      throw new AppError(
        409,
        'MOBILE_ALREADY_REGISTERED',
        'An account with this mobile number is already registered.'
      );
    }

    const now = new Date();
    const id = crypto.randomBytes(12).toString('hex');
    const userCode = this.nextUserCodeForRole('CUSTOMER');
    const entity: UserEntity = {
      id,
      userCode,
      fullName: input.fullName,
      mobileNumber: input.mobileNumber,
      passwordHash: input.passwordHash,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      address: input.address,
      createdBy: null,
      tokenVersion: 0,
      lastLoginAt: now,
      lastLogoutAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.byId.set(id, entity);
    this.byMobile.set(input.mobileNumber, id);
    this.saveToDisk();
    return cloneEntity(entity);
  }

  public provisionAdmin(input: ProvisionAdminInput): {
    user: UserEntity;
    created: boolean;
  } {
    this.loadFromDisk();
    const existingId = this.byMobile.get(input.mobileNumber);
    if (existingId) {
      const existing = this.byId.get(existingId)!;
      if (existing.role !== 'ADMIN') {
        throw new AppError(
          409,
          'MOBILE_ALREADY_REGISTERED',
          'This mobile number is already registered to a non-Admin account.'
        );
      }
      existing.fullName = input.fullName;
      existing.passwordHash = input.passwordHash;
      existing.status = 'ACTIVE';
      existing.updatedAt = new Date();
      this.saveToDisk();
      return { user: cloneEntity(existing), created: false };
    }

    const now = new Date();
    const id = crypto.randomBytes(12).toString('hex');
    const userCode = this.nextUserCodeForRole('ADMIN');
    const entity: UserEntity = {
      id,
      userCode,
      fullName: input.fullName,
      mobileNumber: input.mobileNumber,
      passwordHash: input.passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      createdBy: 'SYSTEM_OPERATOR',
      tokenVersion: 0,
      lastLoginAt: null,
      lastLogoutAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.byId.set(id, entity);
    this.byMobile.set(input.mobileNumber, id);
    this.saveToDisk();
    return { user: cloneEntity(entity), created: true };
  }

  public createManagedAccount(input: CreateManagedAccountInput): UserEntity {
    this.loadFromDisk();
    if (this.byMobile.has(input.mobileNumber)) {
      throw new AppError(
        409,
        'MOBILE_ALREADY_REGISTERED',
        'An account with this login mobile number is already registered.'
      );
    }

    const now = new Date();
    const id = crypto.randomBytes(12).toString('hex');
    const userCode = this.nextUserCodeForRole(input.role);
    const entity: UserEntity = {
      id,
      userCode,
      fullName: input.fullName,
      mobileNumber: input.mobileNumber,
      passwordHash: input.passwordHash,
      role: input.role,
      status: input.status ?? 'ACTIVE',
      staffPermissions:
        input.role === 'STAFF'
          ? [...(input.staffPermissions ?? [])]
          : undefined,
      farmerProfile:
        input.role === 'FARMER' && input.farmerProfile
          ? {
              businessContactMobile: input.farmerProfile.businessContactMobile,
              villageOrLocation: input.farmerProfile.villageOrLocation,
              suppliedMilkTypes: [
                ...(input.farmerProfile.suppliedMilkTypes ?? ['BUFFALO']),
              ],
            }
          : undefined,
      grazingWorkerProfile:
        input.role === 'GRAZING_WORKER'
          ? { ...(input.grazingWorkerProfile ?? {}) }
          : undefined,
      createdBy: input.createdBy,
      tokenVersion: 0,
      lastLoginAt: null,
      lastLogoutAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.byId.set(id, entity);
    this.byMobile.set(input.mobileNumber, id);
    this.saveToDisk();
    return cloneEntity(entity);
  }

  public listAccounts(filter: ListAccountsFilter = {}): UserEntity[] {
    this.loadFromDisk();
    const results: UserEntity[] = [];
    const searchLower = filter.search?.trim().toLowerCase();

    for (const entity of this.byId.values()) {
      if (filter.role === 'ALL_MANAGED') {
        if (
          entity.role !== 'STAFF' &&
          entity.role !== 'FARMER' &&
          entity.role !== 'GRAZING_WORKER'
        ) {
          continue;
        }
      } else if (filter.role && entity.role !== filter.role) {
        continue;
      }

      if (filter.status && entity.status !== filter.status) {
        continue;
      }

      if (searchLower) {
        const matchesName = entity.fullName.toLowerCase().includes(searchLower);
        const matchesCode = entity.userCode.toLowerCase().includes(searchLower);
        const matchesMobile = entity.mobileNumber.includes(searchLower);
        const matchesFarmerBusinessMobile =
          entity.farmerProfile?.businessContactMobile?.includes(searchLower) ??
          false;
        if (
          !matchesName &&
          !matchesCode &&
          !matchesMobile &&
          !matchesFarmerBusinessMobile
        ) {
          continue;
        }
      }

      results.push(cloneEntity(entity));
    }

    return results.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  public updateManagedAccount(
    id: string,
    updates: UpdateManagedAccountInput
  ): UserEntity | null {
    this.loadFromDisk();
    const existing = this.byId.get(id);
    if (!existing) return null;

    if (
      updates.mobileNumber !== undefined &&
      updates.mobileNumber !== existing.mobileNumber
    ) {
      const conflictingId = this.byMobile.get(updates.mobileNumber);
      if (conflictingId && conflictingId !== id) {
        throw new AppError(
          409,
          'MOBILE_ALREADY_REGISTERED',
          'An account with this login mobile number is already registered.'
        );
      }
      this.byMobile.delete(existing.mobileNumber);
      existing.mobileNumber = updates.mobileNumber;
      this.byMobile.set(existing.mobileNumber, id);
    }

    if (updates.fullName !== undefined) {
      existing.fullName = updates.fullName;
    }

    if (updates.passwordHash !== undefined) {
      existing.passwordHash = updates.passwordHash;
      existing.tokenVersion += 1;
    }

    if (existing.role === 'STAFF' && updates.staffPermissions !== undefined) {
      existing.staffPermissions = [...updates.staffPermissions];
    }

    if (existing.role === 'FARMER' && updates.farmerProfile !== undefined) {
      existing.farmerProfile = {
        businessContactMobile: updates.farmerProfile.businessContactMobile,
        villageOrLocation: updates.farmerProfile.villageOrLocation,
        suppliedMilkTypes: [
          ...(updates.farmerProfile.suppliedMilkTypes ?? ['BUFFALO']),
        ],
      };
    }

    if (
      existing.role === 'GRAZING_WORKER' &&
      updates.grazingWorkerProfile !== undefined
    ) {
      existing.grazingWorkerProfile = {
        ...existing.grazingWorkerProfile,
        ...updates.grazingWorkerProfile,
      };
    }

    if (updates.address !== undefined) {
      existing.address = {
        ...existing.address,
        ...updates.address,
      };
    }

    existing.updatedAt = new Date();
    this.saveToDisk();
    return cloneEntity(existing);
  }

  public updateAccountStatus(
    id: string,
    status: UserStatus,
    statusReason?: string
  ): UserEntity | null {
    this.loadFromDisk();
    const existing = this.byId.get(id);
    if (!existing) return null;

    existing.status = status;
    existing.statusReason = statusReason;
    const now = new Date();
    existing.updatedAt = now;

    // Immediately revoke active sessions when account becomes non-ACTIVE
    if (status !== 'ACTIVE') {
      existing.tokenVersion += 1;
      existing.lastLogoutAt = now;
    }

    this.saveToDisk();
    return cloneEntity(existing);
  }

  public recordLogin(id: string): UserEntity | null {
    this.loadFromDisk();
    const existing = this.byId.get(id);
    if (!existing) return null;
    existing.lastLoginAt = new Date();
    existing.updatedAt = new Date();
    this.saveToDisk();
    return cloneEntity(existing);
  }

  public recordLogout(id: string): UserEntity | null {
    this.loadFromDisk();
    const existing = this.byId.get(id);
    if (!existing) return null;
    existing.lastLogoutAt = new Date();
    existing.tokenVersion += 1;
    existing.updatedAt = new Date();
    this.saveToDisk();
    return cloneEntity(existing);
  }

  public updateCustomerProfile(
    id: string,
    updates: UpdateCustomerProfileInput
  ): UserEntity | null {
    this.loadFromDisk();
    const existing = this.byId.get(id);
    if (!existing) return null;
    if (updates.fullName !== undefined) {
      existing.fullName = updates.fullName;
    }
    if (updates.address !== undefined) {
      existing.address = {
        ...existing.address,
        ...updates.address,
      };
    }
    existing.updatedAt = new Date();
    this.saveToDisk();
    return cloneEntity(existing);
  }

  public seedUserForTest(params: {
    fullName: string;
    mobileNumber: string;
    passwordHash: string;
    role: UserRole;
    status: UserStatus;
    staffPermissions?: StaffPermission[];
    farmerProfile?: FarmerProfile;
    grazingWorkerProfile?: GrazingWorkerProfile;
  }): UserEntity {
    const now = new Date();
    const id = crypto.randomBytes(12).toString('hex');
    const userCode = this.nextUserCodeForRole(params.role);
    const entity: UserEntity = {
      id,
      userCode,
      fullName: params.fullName,
      mobileNumber: params.mobileNumber,
      passwordHash: params.passwordHash,
      role: params.role,
      status: params.status,
      staffPermissions:
        params.role === 'STAFF'
          ? [...(params.staffPermissions ?? [])]
          : undefined,
      farmerProfile: params.farmerProfile
        ? { ...params.farmerProfile }
        : undefined,
      grazingWorkerProfile: params.grazingWorkerProfile
        ? { ...params.grazingWorkerProfile }
        : undefined,
      createdBy: null,
      tokenVersion: 0,
      lastLoginAt: null,
      lastLogoutAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(id, entity);
    this.byMobile.set(params.mobileNumber, id);
    this.saveToDisk();
    return cloneEntity(entity);
  }

  public clear(): void {
    this.byId.clear();
    this.byMobile.clear();
    this.saveToDisk();
  }
}

export const inMemoryUserStore = new InMemoryUserStore();

function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

function assertStoreAvailable(): 'mongo' | 'memory' {
  if (isMongoConnected()) {
    return 'mongo';
  }
  if (env.NODE_ENV !== 'production' && env.ALLOW_IN_MEMORY_AUTH_FALLBACK) {
    return 'memory';
  }
  throw new AppError(
    503,
    'DATABASE_UNAVAILABLE',
    'MongoDB connection is not active. Configure a reachable MONGODB_URI.'
  );
}

async function generateMongoUserCode(role: UserRole): Promise<string> {
  const prefix = ROLE_ID_PREFIX[role];
  const latestDoc = await UserModel.findOne({
    role,
    userCode: new RegExp(`^${prefix}-\\d+$`),
  })
    .sort({ userCode: -1 })
    .select('userCode')
    .lean()
    .exec();

  const lastSeq = latestDoc?.userCode
    ? parseSequenceFromUserCode(latestDoc.userCode, role)
    : 0;
  return formatUserCode(role, lastSeq + 1);
}

export const userRepository = {
  async findByMobileWithPassword(
    mobileNumber: string
  ): Promise<UserEntity | null> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryUserStore.findByMobile(mobileNumber);
    }

    const doc = await UserModel.findOne({ mobileNumber })
      .select('+passwordHash')
      .exec();
    return doc ? mapDocToEntity(doc) : null;
  },

  async findById(id: string): Promise<UserEntity | null> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryUserStore.findById(id);
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }

    const doc = await UserModel.findById(id).select('+passwordHash').exec();
    return doc ? mapDocToEntity(doc) : null;
  },

  async findByUserCode(userCode: string): Promise<UserEntity | null> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryUserStore.findByUserCode(userCode);
    }

    const doc = await UserModel.findOne({
      userCode: userCode.trim().toUpperCase(),
    })
      .select('+passwordHash')
      .exec();
    return doc ? mapDocToEntity(doc) : null;
  },

  async createCustomer(input: CreateCustomerInput): Promise<UserEntity> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryUserStore.createCustomer(input);
    }

    try {
      const now = new Date();
      const userCode = await generateMongoUserCode('CUSTOMER');
      const created = await UserModel.create({
        userCode,
        fullName: input.fullName,
        mobileNumber: input.mobileNumber,
        passwordHash: input.passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        address: input.address,
        createdBy: null,
        tokenVersion: 0,
        lastLoginAt: now,
      });
      return mapDocToEntity(created);
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr && mongoErr.code === 11000) {
        throw new AppError(
          409,
          'MOBILE_ALREADY_REGISTERED',
          'An account with this mobile number is already registered.'
        );
      }
      throw err;
    }
  },

  async provisionAdmin(
    input: ProvisionAdminInput
  ): Promise<{ user: UserEntity; created: boolean }> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryUserStore.provisionAdmin(input);
    }

    const existing = await UserModel.findOne({
      mobileNumber: input.mobileNumber,
    })
      .select('+passwordHash')
      .exec();

    if (existing) {
      if (existing.role !== 'ADMIN') {
        throw new AppError(
          409,
          'MOBILE_ALREADY_REGISTERED',
          'This mobile number is already registered to a non-Admin account.'
        );
      }
      existing.fullName = input.fullName;
      existing.passwordHash = input.passwordHash;
      existing.status = 'ACTIVE';
      await existing.save();
      return { user: mapDocToEntity(existing), created: false };
    }

    const userCode = await generateMongoUserCode('ADMIN');
    const created = await UserModel.create({
      userCode,
      fullName: input.fullName,
      mobileNumber: input.mobileNumber,
      passwordHash: input.passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      createdBy: 'SYSTEM_OPERATOR',
      tokenVersion: 0,
    });

    return { user: mapDocToEntity(created), created: true };
  },

  async createManagedAccount(
    input: CreateManagedAccountInput
  ): Promise<UserEntity> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryUserStore.createManagedAccount(input);
    }

    try {
      const userCode = await generateMongoUserCode(input.role);
      const created = await UserModel.create({
        userCode,
        fullName: input.fullName,
        mobileNumber: input.mobileNumber,
        passwordHash: input.passwordHash,
        role: input.role,
        status: input.status ?? 'ACTIVE',
        staffPermissions:
          input.role === 'STAFF'
            ? (input.staffPermissions ?? [])
            : undefined,
        farmerProfile:
          input.role === 'FARMER' ? input.farmerProfile : undefined,
        grazingWorkerProfile:
          input.role === 'GRAZING_WORKER'
            ? input.grazingWorkerProfile
            : undefined,
        createdBy: input.createdBy,
        tokenVersion: 0,
      });
      return mapDocToEntity(created);
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr && mongoErr.code === 11000) {
        throw new AppError(
          409,
          'MOBILE_ALREADY_REGISTERED',
          'An account with this login mobile number is already registered.'
        );
      }
      throw err;
    }
  },

  async listAccounts(filter: ListAccountsFilter = {}): Promise<UserEntity[]> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryUserStore.listAccounts(filter);
    }

    const query: Record<string, unknown> = {};
    if (filter.role === 'ALL_MANAGED') {
      query.role = { $in: ['STAFF', 'FARMER', 'GRAZING_WORKER'] };
    } else if (filter.role) {
      query.role = filter.role;
    }

    if (filter.status) {
      query.status = filter.status;
    }

    if (filter.search?.trim()) {
      const escaped = filter.search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query.$or = [
        { fullName: regex },
        { userCode: regex },
        { mobileNumber: regex },
        { 'farmerProfile.businessContactMobile': regex },
      ];
    }

    const docs = await UserModel.find(query)
      .sort({ createdAt: -1 })
      .exec();

    return docs.map(mapDocToEntity);
  },

  async updateManagedAccount(
    id: string,
    updates: UpdateManagedAccountInput
  ): Promise<UserEntity | null> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryUserStore.updateManagedAccount(id, updates);
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }

    const updateSet: Record<string, unknown> = {};
    const updateInc: Record<string, number> = {};

    if (updates.fullName !== undefined) {
      updateSet.fullName = updates.fullName;
    }
    if (updates.mobileNumber !== undefined) {
      updateSet.mobileNumber = updates.mobileNumber;
    }
    if (updates.passwordHash !== undefined) {
      updateSet.passwordHash = updates.passwordHash;
      updateInc.tokenVersion = 1;
    }
    if (updates.staffPermissions !== undefined) {
      updateSet.staffPermissions = updates.staffPermissions;
    }
    if (updates.farmerProfile !== undefined) {
      updateSet.farmerProfile = updates.farmerProfile;
    }
    if (updates.grazingWorkerProfile !== undefined) {
      updateSet.grazingWorkerProfile = updates.grazingWorkerProfile;
    }
    if (updates.address !== undefined) {
      updateSet.address = updates.address;
    }

    const updateDoc: Record<string, unknown> = { $set: updateSet };
    if (Object.keys(updateInc).length > 0) {
      updateDoc.$inc = updateInc;
    }

    try {
      const doc = await UserModel.findByIdAndUpdate(id, updateDoc, {
        new: true,
        runValidators: true,
      })
        .select('+passwordHash')
        .exec();

      return doc ? mapDocToEntity(doc) : null;
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr && mongoErr.code === 11000) {
        throw new AppError(
          409,
          'MOBILE_ALREADY_REGISTERED',
          'An account with this login mobile number is already registered.'
        );
      }
      throw err;
    }
  },

  async updateAccountStatus(
    id: string,
    status: UserStatus,
    statusReason?: string
  ): Promise<UserEntity | null> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryUserStore.updateAccountStatus(id, status, statusReason);
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }

    const now = new Date();
    const updateDoc: Record<string, unknown> = {
      $set: {
        status,
        statusReason: statusReason ?? '',
        ...(status !== 'ACTIVE' ? { lastLogoutAt: now } : {}),
      },
      ...(status !== 'ACTIVE' ? { $inc: { tokenVersion: 1 } } : {}),
    };

    const doc = await UserModel.findByIdAndUpdate(id, updateDoc, {
      new: true,
      runValidators: true,
    })
      .select('+passwordHash')
      .exec();

    return doc ? mapDocToEntity(doc) : null;
  },

  async recordLogin(id: string): Promise<UserEntity | null> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryUserStore.recordLogin(id);
    }

    const doc = await UserModel.findByIdAndUpdate(
      id,
      { $set: { lastLoginAt: new Date() } },
      { new: true }
    )
      .select('+passwordHash')
      .exec();

    return doc ? mapDocToEntity(doc) : null;
  },

  async recordLogout(id: string): Promise<UserEntity | null> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryUserStore.recordLogout(id);
    }

    const doc = await UserModel.findByIdAndUpdate(
      id,
      {
        $set: { lastLogoutAt: new Date() },
        $inc: { tokenVersion: 1 },
      },
      { new: true }
    )
      .select('+passwordHash')
      .exec();

    return doc ? mapDocToEntity(doc) : null;
  },

  async updateCustomerProfile(
    id: string,
    updates: UpdateCustomerProfileInput
  ): Promise<UserEntity | null> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryUserStore.updateCustomerProfile(id, updates);
    }

    const updateSet: Record<string, unknown> = {};
    if (updates.fullName !== undefined) {
      updateSet.fullName = updates.fullName;
    }
    if (updates.address !== undefined) {
      updateSet.address = updates.address;
    }

    const doc = await UserModel.findByIdAndUpdate(
      id,
      { $set: updateSet },
      { new: true, runValidators: true }
    )
      .select('+passwordHash')
      .exec();

    return doc ? mapDocToEntity(doc) : null;
  },
};
