import mongoose, { Schema, Document, Model } from 'mongoose';
import { UserRole } from './User';

export type AuditActionType =
  | 'ADMIN_PROVISIONED'
  | 'ACCOUNT_CREATED'
  | 'ACCOUNT_UPDATED'
  | 'ACCOUNT_STATUS_CHANGED'
  | 'STAFF_PERMISSIONS_UPDATED'
  | 'ACCOUNT_PASSWORD_RESET'
  | 'CUSTOMER_CREATED_BY_ADMIN'
  | 'CUSTOMER_BULK_IMPORTED'
  | 'CUSTOMER_UPDATED'
  | 'CUSTOMER_MOBILE_CHANGED'
  | 'MILK_SERVICE_STATUS_CHANGED'
  | 'PRODUCT_SERVICE_STATUS_CHANGED'
  | 'WEEKLY_SCHEDULE_UPDATED'
  | 'WEEKLY_SCHEDULE_ACTIVATED'
  | 'WEEKLY_SCHEDULE_DEACTIVATED'
  | 'WEEKLY_SCHEDULE_PAUSED'
  | 'WEEKLY_SCHEDULE_RESUMED'
  | 'ADDRESS_CREATED'
  | 'ADDRESS_UPDATED'
  | 'ADDRESS_ARCHIVED'
  | 'ACTIVE_ADDRESS_CHANGED'
  | 'CUSTOMER_NOTE_CREATED'
  | 'PASSWORD_CHANGE_REQUIRED_SET'
  | 'PASSWORD_CHANGED'
  | 'MIGRATION_CUSTOMER'
  | 'CUSTOMER_TAG_UPDATED';

export interface AuditLogEntity {
  id: string;
  action: AuditActionType;
  actorId: string;
  actorRole: UserRole | 'SYSTEM_OPERATOR';
  targetUserId: string;
  targetUserCode: string;
  targetRole: UserRole;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface IAuditLogDocument extends Document {
  action: AuditActionType;
  actorId: string;
  actorRole: UserRole | 'SYSTEM_OPERATOR';
  targetUserId: string;
  targetUserCode: string;
  targetRole: UserRole;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLogDocument>(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'ADMIN_PROVISIONED',
        'ACCOUNT_CREATED',
        'ACCOUNT_UPDATED',
        'ACCOUNT_STATUS_CHANGED',
        'STAFF_PERMISSIONS_UPDATED',
        'ACCOUNT_PASSWORD_RESET',
        'CUSTOMER_CREATED_BY_ADMIN',
        'CUSTOMER_BULK_IMPORTED',
        'CUSTOMER_UPDATED',
        'CUSTOMER_MOBILE_CHANGED',
        'MILK_SERVICE_STATUS_CHANGED',
        'PRODUCT_SERVICE_STATUS_CHANGED',
        'WEEKLY_SCHEDULE_UPDATED',
        'WEEKLY_SCHEDULE_ACTIVATED',
        'WEEKLY_SCHEDULE_DEACTIVATED',
        'WEEKLY_SCHEDULE_PAUSED',
        'WEEKLY_SCHEDULE_RESUMED',
        'ADDRESS_CREATED',
        'ADDRESS_UPDATED',
        'ADDRESS_ARCHIVED',
        'ACTIVE_ADDRESS_CHANGED',
        'CUSTOMER_NOTE_CREATED',
        'PASSWORD_CHANGE_REQUIRED_SET',
        'PASSWORD_CHANGED',
        'MIGRATION_CUSTOMER',
        'CUSTOMER_TAG_UPDATED',
      ],
    },
    actorId: { type: String, required: true },
    actorRole: {
      type: String,
      required: true,
      enum: [
        'ADMIN',
        'CUSTOMER',
        'STAFF',
        'FARMER',
        'GRAZING_WORKER',
        'SYSTEM_OPERATOR',
      ],
    },
    targetUserId: { type: String, required: true },
    targetUserCode: { type: String, required: true },
    targetRole: {
      type: String,
      required: true,
      enum: ['ADMIN', 'CUSTOMER', 'STAFF', 'FARMER', 'GRAZING_WORKER'],
    },
    summary: { type: String, required: true, trim: true, maxlength: 500 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'auditLogs',
  }
);

AuditLogSchema.index({ createdAt: -1 }, { name: 'audit_created_desc' });
AuditLogSchema.index({ targetUserId: 1, createdAt: -1 }, { name: 'audit_target_user' });

export const AuditLogModel: Model<IAuditLogDocument> =
  mongoose.models.AuditLog ||
  mongoose.model<IAuditLogDocument>('AuditLog', AuditLogSchema);
