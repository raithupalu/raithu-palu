import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import {
  AuditLogModel,
  AuditLogEntity,
  AuditActionType,
  IAuditLogDocument,
} from '../models/AuditLog';
import { UserRole } from '../models/User';
import { env } from '../config/env';
import { AppError } from '../middleware/notFound';

export interface CreateAuditLogInput {
  action: AuditActionType;
  actorId: string;
  actorRole: UserRole | 'SYSTEM_OPERATOR';
  targetUserId: string;
  targetUserCode: string;
  targetRole: UserRole;
  summary: string;
  metadata?: Record<string, unknown>;
}

interface SerializedAuditLogEntity extends Omit<AuditLogEntity, 'createdAt'> {
  createdAt: string;
}

function mapDocToEntity(doc: IAuditLogDocument): AuditLogEntity {
  return {
    id: doc._id.toString(),
    action: doc.action,
    actorId: doc.actorId,
    actorRole: doc.actorRole,
    targetUserId: doc.targetUserId,
    targetUserCode: doc.targetUserCode,
    targetRole: doc.targetRole,
    summary: doc.summary,
    metadata: doc.metadata ?? {},
    createdAt: doc.createdAt,
  };
}

export class InMemoryAuditLogStore {
  private logs: AuditLogEntity[] = [];
  private readonly persistFilePath: string;
  private readonly forceDiskPersistence: boolean;

  constructor(customPersistFilePath?: string, forceDiskPersistence = false) {
    const dataDir = path.resolve(process.cwd(), '.data');
    this.persistFilePath =
      customPersistFilePath ?? path.join(dataDir, 'dev-audit-logs.json');
    this.forceDiskPersistence = forceDiskPersistence;
    this.loadFromDisk();
  }

  private isDiskPersistenceEnabled(): boolean {
    if (this.forceDiskPersistence) {
      return true;
    }
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
      const items = JSON.parse(raw) as SerializedAuditLogEntity[];
      this.logs = items.map((item) => ({
        ...item,
        metadata: item.metadata ?? {},
        createdAt: new Date(item.createdAt),
      }));
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
      const serialized: SerializedAuditLogEntity[] = this.logs.map((log) => ({
        ...log,
        createdAt: log.createdAt.toISOString(),
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

  public record(input: CreateAuditLogInput): AuditLogEntity {
    this.loadFromDisk();
    const entry: AuditLogEntity = {
      id: crypto.randomBytes(12).toString('hex'),
      action: input.action,
      actorId: input.actorId,
      actorRole: input.actorRole,
      targetUserId: input.targetUserId,
      targetUserCode: input.targetUserCode,
      targetRole: input.targetRole,
      summary: input.summary,
      metadata: input.metadata ? { ...input.metadata } : {},
      createdAt: new Date(),
    };
    this.logs.unshift(entry);
    this.saveToDisk();
    return { ...entry };
  }

  public list(
    filter: { targetUserId?: string; limit?: number } = {}
  ): AuditLogEntity[] {
    this.loadFromDisk();
    const limit = filter.limit ?? 50;
    const filtered = filter.targetUserId
      ? this.logs.filter((l) => l.targetUserId === filter.targetUserId)
      : this.logs;
    return filtered.slice(0, limit).map((l) => ({ ...l }));
  }

  public clear(): void {
    this.logs = [];
    this.saveToDisk();
  }
}

export const inMemoryAuditLogStore = new InMemoryAuditLogStore();

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

export const auditLogRepository = {
  async record(input: CreateAuditLogInput): Promise<AuditLogEntity> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryAuditLogStore.record(input);
    }

    const doc = await AuditLogModel.create({
      action: input.action,
      actorId: input.actorId,
      actorRole: input.actorRole,
      targetUserId: input.targetUserId,
      targetUserCode: input.targetUserCode,
      targetRole: input.targetRole,
      summary: input.summary,
      metadata: input.metadata ?? {},
    });

    return mapDocToEntity(doc);
  },

  async list(
    filter: { targetUserId?: string; limit?: number } = {}
  ): Promise<AuditLogEntity[]> {
    const mode = assertStoreAvailable();
    if (mode === 'memory') {
      return inMemoryAuditLogStore.list(filter);
    }

    const query: Record<string, unknown> = {};
    if (filter.targetUserId) {
      query.targetUserId = filter.targetUserId;
    }

    const docs = await AuditLogModel.find(query)
      .sort({ createdAt: -1 })
      .limit(filter.limit ?? 50)
      .exec();

    return docs.map(mapDocToEntity);
  },
};
