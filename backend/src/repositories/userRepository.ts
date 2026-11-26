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

export function formatUserCode(role: UserRole, sequenceNumber: number): string {
  const prefix = ROLE_ID_PREFIX[role];
  return `${prefix}-${String(sequenceNumber).padStart(4, '0')}`;
}

export function parseSequenceFromUserCode(
  userCode: string | undefined,
  role: UserRole
): number {
  if (!userCode) return 0;
  const prefix = `${ROLE_ID_PREFIX[role]}-`;
  if (!userCode.startsWith(prefix)) return 0;
  const numericPart = Number.parseInt(userCode.slice(prefix.length), 10);
  return Number.isFinite(numericPart) && numericPart > 0 ? numericPart : 0;
}

interface MongoDuplicateErrorShape {
  code?: number;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
  message?: string;
  errmsg?: string;
}

export function isUserCodeDuplicateError(err: unknown): boolean {
  const mongoErr = err as MongoDuplicateErrorShape | null | undefined;
  if (!mongoErr || mongoErr.code !== 11000) {
    return false;
  }
  if (mongoErr.keyPattern && 'userCode' in mongoErr.keyPattern) {
    return true;
  }
  if (mongoErr.keyValue && 'userCode' in mongoErr.keyValue) {
    return true;
  }
  const msg = `${mongoErr.errmsg ?? ''} ${mongoErr.message ?? ''}`;
  return /user_code_unique|\buserCode\b/i.test(msg);
}

export function isMobileDuplicateError(err: unknown): boolean {
  const mongoErr = err as MongoDuplicateErrorShape | null | undefined;
  if (!mongoErr || mongoErr.code !== 11000) {
    return false;
  }
  if (mongoErr.keyPattern && 'mobileNumber' in mongoErr.keyPattern) {
    return true;
  }
  if (mongoErr.keyValue && 'mobileNumber' in mongoErr.keyValue) {
    return true;
  }
  const msg = `${mongoErr.errmsg ?? ''} ${mongoErr.message ?? ''}`;
  return /user_mobile_unique|\bmobileNumber\b/i.test(msg);
}

export function mapMongoDuplicateError(
  err: unknown,
  mobileConflictMessage: string
): AppError | null {
  const mongoErr = err as MongoDuplicateErrorShape | null | undefined;
  if (!mongoErr || mongoErr.code !== 11000) {
    return null;
  }
  if (isUserCodeDuplicateError(err)) {
    return new AppError(
      409,
      'USER_CODE_CONFLICT',
      'Could not allocate a unique user code due to concurrent account creation. Please retry.'
    );
  }
  if (isMobileDuplicateError(err)) {
    return new AppError(
      409,
      'MOBILE_ALREADY_REGISTERED',
      mobileConflictMessage
    );
  }
  return new AppError(
    409,
    'MOBILE_ALREADY_REGISTERED',
    mobileConflictMessage
  );
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
            suppliedMilkTypes: [
              ...(doc.farmerProfile.suppliedMilkTypes ?? ['BUFFALO']),
            ],
          }
        : undefined,
    grazingWorkerProfile:
      doc.role === 'GRAZING_WORKER' && doc.grazingWorkerProfile
        ? {
            emergencyContactMobile:
              doc.grazingWorkerProfile.emergencyContactMobile,
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
  private byUserCode = new Map<string, string>();
  private roleSequenceFloor = new Map<UserRole, number>();
  private readonly persistFilePath: string;

  constructor(customPersistFilePath?: string) {
    const dataDir = path.resolve(process.cwd(), '.data');
    this.persistFilePath =
      customPersistFilePath ?? path.join(dataDir, 'dev-users.json');
    this.loadFromDisk();
  }

  private isDiskPersistenceEnabled(): boolean {
    return (
      process.env.NODE_ENV !== 'test' &&
      env.NODE_ENV === 'development' &&
      env.ALLOW_IN_MEMORY_AUTH_FALLBACK
    );
  }

  public nextUserCodeForRole(role: UserRole): string {
    let maxSeq = this.roleSequenceFloor.get(role) ?? 0;
    for (const user of this.byId.values()) {
      if (user.role === role) {
        const seq = parseSequenceFromUserCode(user.userCode, role);
        if (seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
    const nextSeq = maxSeq + 1;
    this.roleSequenceFloor.set(role, nextSeq);
    return formatUserCode(role, nextSeq);
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
      this.byUserCode.clear();
      this.roleSequenceFloor.clear();
      let migrated = false;
      for (const item of items) {
        const role: UserRole = item.role || 'CUSTOMER';
        let userCode = item.userCode;
        if (!userCode) {
          userCode = this.nextUserCodeForRole(role);
          migrated = true;
        } else {
          const seq = parseSequenceFromUserCode(userCode, role);
          const prevFloor = this.roleSequenceFloor.get(role) ?? 0;
          if (seq > prevFloor) {
            this.roleSequenceFloor.set(role, seq);
          }
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
        this.byUserCode.set(entity.userCode, entity.id);
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
    const id = this.byUserCode.get(normalized);
    if (id) {
      const found = this.byId.get(id);
      if (found) return cloneEntity(found);
    }
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
    if (this.byUserCode.has(userCode)) {
      throw new AppError(
        409,
        'USER_CODE_CONFLICT',
        'Could not allocate a unique user code due to concurrent account creation. Please retry.'
      );
    }

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
    this.byUserCode.set(userCode, id);
    this.saveToDisk();
    return cloneEntity(entity);
  }

  public provisionAdmin(input: ProvisionAdminInput): {
    user: UserEntity;
    created: boolean;
  } {
    this.loadFromDisk();

    // Reject duplicate Admin provisioning: never overwrite an existing Admin or silently create additional Admin accounts
    for (const user of this.byId.values()) {
      if (user.role === 'ADMIN') {
        throw new AppError(
          409,
          'ADMIN_ALREADY_PROVISIONED',
          'An Admin account has already been provisioned. Duplicate Admin provisioning is not permitted.'
        );
      }
    }

    if (this.byMobile.has(input.mobileNumber)) {
      throw new AppError(
        409,
        'MOBILE_ALREADY_REGISTERED',
        'This mobile number is already registered to a non-Admin account.'
      );
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
    this.byUserCode.set(userCode, id);
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
    if (this.byUserCode.has(userCode)) {
      throw new AppError(
        409,
        'USER_CODE_CONFLICT',
        'Could not allocate a unique user code due to concurrent account creation. Please retry.'
      );
    }

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
    this.byUserCode.set(userCode, id);
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
    userCode?: string;
    staffPermissions?: StaffPermission[];
    farmerProfile?: FarmerProfile;
    grazingWorkerProfile?: GrazingWorkerProfile;
  }): UserEntity {
    const now = new Date();
    const id = crypto.randomBytes(12).toString('hex');
    const userCode =
      params.userCode ?? this.nextUserCodeForRole(params.role);
    const parsedSeq = parseSequenceFromUserCode(userCode, params.role);
    const currentFloor = this.roleSequenceFloor.get(params.role) ?? 0;
    if (parsedSeq > currentFloor) {
      this.roleSequenceFloor.set(params.role, parsedSeq);
    }

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
    this.byUserCode.set(userCode, id);
    this.saveToDisk();
    return cloneEntity(entity);
  }

  public clear(): void {
    this.byId.clear();
    this.byMobile.clear();
    this.byUserCode.clear();
    this.roleSequenceFloor.clear();
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

const mongoRoleSequenceFloor: Record<UserRole, number> = {
  ADMIN: 0,
  CUSTOMER: 0,
  STAFF: 0,
  FARMER: 0,
  GRAZING_WORKER: 0,
};

/**
 * Generates the next sequential userCode for a role safely across sequences > 9999
 * (avoiding lexicographical string sort issues where "9999" > "10000") and
 * reserving monotonically increasing numbers under concurrent in-process calls.
 */
async function generateMongoUserCode(role: UserRole): Promise<string> {
  const prefix = ROLE_ID_PREFIX[role];
  const docs = await UserModel.find({
    role,
    userCode: new RegExp(`^${prefix}-\\d+$`),
  })
    .select('userCode')
    .lean()
    .exec();

  let maxDbSeq = 0;
  for (const doc of docs) {
    const seq = parseSequenceFromUserCode(doc.userCode, role);
    if (seq > maxDbSeq) {
      maxDbSeq = seq;
    }
  }

  const nextSeq = Math.max(maxDbSeq, mongoRoleSequenceFloor[role] ?? 0) + 1;
  mongoRoleSequenceFloor[role] = nextSeq;
  return formatUserCode(role, nextSeq);
}

const MAX_USER_CODE_RETRIES = 5;

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

    for (let attempt = 1; attempt <= MAX_USER_CODE_RETRIES; attempt += 1) {
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
        if (isUserCodeDuplicateError(err) && attempt < MAX_USER_CODE_RETRIES) {
          continue;
        }
        const mapped = mapMongoDuplicateError(
          err,
          'An account with this mobile number is already registered.'
        );
        if (mapped) {
          throw mapped;
        }
        throw err;
      }
    }

    throw new AppError(
      409,
      'USER_CODE_CONFLICT',
      'Could not allocate a unique user code due to concurrent account creation. Please retry.'
    );
  },

  async provisionAdmin(
    input: ProvisionAdminInput
  ): Promise<{ user: UserEntity; created: boolean }> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryUserStore.provisionAdmin(input);
    }

    // Reject duplicate Admin provisioning: never overwrite an existing Admin or silently create additional Admin accounts
    const existingAdmin = await UserModel.findOne({ role: 'ADMIN' })
      .select('_id userCode')
      .lean()
      .exec();

    if (existingAdmin) {
      throw new AppError(
        409,
        'ADMIN_ALREADY_PROVISIONED',
        'An Admin account has already been provisioned. Duplicate Admin provisioning is not permitted.'
      );
    }

    const existingMobileUser = await UserModel.findOne({
      mobileNumber: input.mobileNumber,
    })
      .select('_id role')
      .lean()
      .exec();

    if (existingMobileUser) {
      throw new AppError(
        409,
        'MOBILE_ALREADY_REGISTERED',
        'This mobile number is already registered to a non-Admin account.'
      );
    }

    try {
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
    } catch (err: unknown) {
      const mapped = mapMongoDuplicateError(
        err,
        'This mobile number is already registered to a non-Admin account.'
      );
      if (mapped) {
        throw mapped;
      }
      throw err;
    }
  },

  async createManagedAccount(
    input: CreateManagedAccountInput
  ): Promise<UserEntity> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryUserStore.createManagedAccount(input);
    }

    for (let attempt = 1; attempt <= MAX_USER_CODE_RETRIES; attempt += 1) {
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
        if (isUserCodeDuplicateError(err) && attempt < MAX_USER_CODE_RETRIES) {
          continue;
        }
        const mapped = mapMongoDuplicateError(
          err,
          'An account with this login mobile number is already registered.'
        );
        if (mapped) {
          throw mapped;
        }
        throw err;
      }
    }

    throw new AppError(
      409,
      'USER_CODE_CONFLICT',
      'Could not allocate a unique user code due to concurrent account creation. Please retry.'
    );
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
      const mapped = mapMongoDuplicateError(
        err,
        'An account with this login mobile number is already registered.'
      );
      if (mapped) {
        throw mapped;
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
