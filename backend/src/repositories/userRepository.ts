import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import {
  UserModel,
  UserEntity,
  IUserDocument,
  UserRole,
  UserStatus,
  CustomerAddress,
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

function mapDocToEntity(doc: IUserDocument): UserEntity {
  return {
    id: doc._id.toString(),
    fullName: doc.fullName,
    mobileNumber: doc.mobileNumber,
    passwordHash: doc.passwordHash,
    role: doc.role,
    status: doc.status,
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
    tokenVersion: doc.tokenVersion ?? 0,
    lastLoginAt: doc.lastLoginAt ?? null,
    lastLogoutAt: doc.lastLogoutAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

interface SerializedUserEntity extends Omit<
  UserEntity,
  'lastLoginAt' | 'lastLogoutAt' | 'createdAt' | 'updatedAt'
> {
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
      for (const item of items) {
        const entity: UserEntity = {
          ...item,
          lastLoginAt: item.lastLoginAt ? new Date(item.lastLoginAt) : null,
          lastLogoutAt: item.lastLogoutAt ? new Date(item.lastLogoutAt) : null,
          createdAt: new Date(item.createdAt),
          updatedAt: new Date(item.updatedAt),
        };
        this.byId.set(entity.id, entity);
        this.byMobile.set(entity.mobileNumber, entity.id);
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
    return entity ? { ...entity } : null;
  }

  public findById(id: string): UserEntity | null {
    this.loadFromDisk();
    const entity = this.byId.get(id);
    return entity ? { ...entity } : null;
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
    const entity: UserEntity = {
      id,
      fullName: input.fullName,
      mobileNumber: input.mobileNumber,
      passwordHash: input.passwordHash,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      address: input.address,
      tokenVersion: 0,
      lastLoginAt: now,
      lastLogoutAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.byId.set(id, entity);
    this.byMobile.set(input.mobileNumber, id);
    this.saveToDisk();
    return { ...entity };
  }

  public recordLogin(id: string): UserEntity | null {
    this.loadFromDisk();
    const existing = this.byId.get(id);
    if (!existing) return null;
    existing.lastLoginAt = new Date();
    existing.updatedAt = new Date();
    this.saveToDisk();
    return { ...existing };
  }

  public recordLogout(id: string): UserEntity | null {
    this.loadFromDisk();
    const existing = this.byId.get(id);
    if (!existing) return null;
    existing.lastLogoutAt = new Date();
    existing.tokenVersion += 1;
    existing.updatedAt = new Date();
    this.saveToDisk();
    return { ...existing };
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
    return { ...existing };
  }

  public seedUserForTest(params: {
    fullName: string;
    mobileNumber: string;
    passwordHash: string;
    role: UserRole;
    status: UserStatus;
  }): UserEntity {
    const now = new Date();
    const id = crypto.randomBytes(12).toString('hex');
    const entity: UserEntity = {
      id,
      fullName: params.fullName,
      mobileNumber: params.mobileNumber,
      passwordHash: params.passwordHash,
      role: params.role,
      status: params.status,
      tokenVersion: 0,
      lastLoginAt: null,
      lastLogoutAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(id, entity);
    this.byMobile.set(params.mobileNumber, id);
    this.saveToDisk();
    return { ...entity };
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
  if (env.ALLOW_IN_MEMORY_AUTH_FALLBACK) {
    return 'memory';
  }
  throw new AppError(
    503,
    'DATABASE_UNAVAILABLE',
    'MongoDB connection is not active. Configure a reachable MONGODB_URI.'
  );
}

export const userRepository = {
  async findByMobileWithPassword(mobileNumber: string): Promise<UserEntity | null> {
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

  async createCustomer(input: CreateCustomerInput): Promise<UserEntity> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryUserStore.createCustomer(input);
    }

    try {
      const now = new Date();
      const created = await UserModel.create({
        fullName: input.fullName,
        mobileNumber: input.mobileNumber,
        passwordHash: input.passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        address: input.address,
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
