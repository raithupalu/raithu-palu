import crypto from 'crypto';
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

class InMemoryAuditLogStore {
  private logs: AuditLogEntity[] = [];

  public record(input: CreateAuditLogInput): AuditLogEntity {
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
    return { ...entry };
  }

  public list(filter: { targetUserId?: string; limit?: number } = {}): AuditLogEntity[] {
    const limit = filter.limit ?? 50;
    const filtered = filter.targetUserId
      ? this.logs.filter((l) => l.targetUserId === filter.targetUserId)
      : this.logs;
    return filtered.slice(0, limit).map((l) => ({ ...l }));
  }

  public clear(): void {
    this.logs = [];
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
