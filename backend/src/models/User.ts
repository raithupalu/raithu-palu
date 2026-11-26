import mongoose, { Schema, Document, Model } from 'mongoose';

export type UserRole =
  | 'ADMIN'
  | 'CUSTOMER'
  | 'STAFF'
  | 'FARMER'
  | 'GRAZING_WORKER';

export type ManagedUserRole = 'STAFF' | 'FARMER' | 'GRAZING_WORKER';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'BLOCKED';

export const VALID_USER_STATUSES: readonly UserStatus[] = [
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'BLOCKED',
];

export const ROLE_ID_PREFIX: Record<UserRole, string> = {
  ADMIN: 'ADM',
  CUSTOMER: 'CUS',
  STAFF: 'STF',
  FARMER: 'FRM',
  GRAZING_WORKER: 'GRZ',
};

/**
 * Approved View-Only Staff Permissions (SRA v3.0 / Architecture v12)
 * Staff accounts are strictly view-only by default and can only hold read permissions
 * explicitly granted by an Admin.
 */
export type StaffPermission =
  | 'VIEW_CUSTOMERS'
  | 'VIEW_DAILY_DELIVERIES'
  | 'VIEW_BILLING'
  | 'VIEW_PRODUCT_ORDERS'
  | 'VIEW_FARMER_SUPPLY'
  | 'VIEW_GRAZING_ATTENDANCE';

export const APPROVED_STAFF_PERMISSIONS: readonly StaffPermission[] = [
  'VIEW_CUSTOMERS',
  'VIEW_DAILY_DELIVERIES',
  'VIEW_BILLING',
  'VIEW_PRODUCT_ORDERS',
  'VIEW_FARMER_SUPPLY',
  'VIEW_GRAZING_ATTENDANCE',
];

export type MilkType = 'BUFFALO' | 'COW';

export interface CustomerAddress {
  line1?: string;
  line2?: string;
  landmark?: string;
  city?: string;
  pincode?: string;
  deliveryNotes?: string;
}

export interface FarmerProfile {
  /**
   * Separate business/procurement contact mobile number for the farmer.
   * Distinct from `UserEntity.mobileNumber` (which is the login mobile number).
   */
  businessContactMobile: string;
  villageOrLocation?: string;
  suppliedMilkTypes: MilkType[];
}

export interface GrazingWorkerProfile {
  emergencyContactMobile?: string;
  assignedNotes?: string;
}

export interface UserEntity {
  id: string;
  userCode: string;
  fullName: string;
  /** Login mobile number used for authentication */
  mobileNumber: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  statusReason?: string;
  address?: CustomerAddress;
  staffPermissions?: StaffPermission[];
  farmerProfile?: FarmerProfile;
  grazingWorkerProfile?: GrazingWorkerProfile;
  createdBy?: string | null;
  tokenVersion: number;
  lastLoginAt: Date | null;
  lastLogoutAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PublicUserProfile = Omit<UserEntity, 'passwordHash' | 'tokenVersion'>;

export interface IUserDocument extends Document {
  userCode: string;
  fullName: string;
  mobileNumber: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  statusReason?: string;
  address?: CustomerAddress;
  staffPermissions?: StaffPermission[];
  farmerProfile?: FarmerProfile;
  grazingWorkerProfile?: GrazingWorkerProfile;
  createdBy?: string | null;
  tokenVersion: number;
  lastLoginAt: Date | null;
  lastLogoutAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerAddressSchema = new Schema<CustomerAddress>(
  {
    line1: { type: String, trim: true, maxlength: 150 },
    line2: { type: String, trim: true, maxlength: 150 },
    landmark: { type: String, trim: true, maxlength: 120 },
    city: { type: String, trim: true, maxlength: 80 },
    pincode: {
      type: String,
      trim: true,
      match: [/^\d{6}$/, 'Pincode must be a 6-digit number.'],
    },
    deliveryNotes: { type: String, trim: true, maxlength: 250 },
  },
  { _id: false }
);

const FarmerProfileSchema = new Schema<FarmerProfile>(
  {
    businessContactMobile: {
      type: String,
      required: [
        true,
        'Farmer business contact mobile number is required.',
      ],
      trim: true,
      match: [
        /^[6-9]\d{9}$/,
        'Farmer business contact mobile must be a valid 10-digit Indian mobile number.',
      ],
    },
    villageOrLocation: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    suppliedMilkTypes: {
      type: [String],
      enum: ['BUFFALO', 'COW'],
      default: ['BUFFALO'],
    },
  },
  { _id: false }
);

const GrazingWorkerProfileSchema = new Schema<GrazingWorkerProfile>(
  {
    emergencyContactMobile: {
      type: String,
      trim: true,
      match: [
        /^[6-9]\d{9}$/,
        'Emergency contact mobile must be a valid 10-digit Indian mobile number.',
      ],
    },
    assignedNotes: {
      type: String,
      trim: true,
      maxlength: 250,
    },
  },
  { _id: false }
);

const UserSchema = new Schema<IUserDocument>(
  {
    userCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [
        /^(ADM|CUS|STF|FRM|GRZ)-\d{4,}$/,
        'User code must follow the approved prefix format (ADM/CUS/STF/FRM/GRZ-XXXX).',
      ],
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required.'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters long.'],
      maxlength: [100, 'Full name cannot exceed 100 characters.'],
    },
    mobileNumber: {
      type: String,
      required: [true, 'Mobile number is required.'],
      trim: true,
      unique: true,
      match: [
        /^[6-9]\d{9}$/,
        'Mobile number must be a valid 10-digit Indian mobile number starting with 6–9.',
      ],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required.'],
      select: false,
    },
    role: {
      type: String,
      enum: ['ADMIN', 'CUSTOMER', 'STAFF', 'FARMER', 'GRAZING_WORKER'],
      default: 'CUSTOMER',
      required: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLOCKED'],
      default: 'ACTIVE',
      required: true,
    },
    statusReason: {
      type: String,
      trim: true,
      maxlength: 250,
      default: undefined,
    },
    address: {
      type: CustomerAddressSchema,
      default: undefined,
    },
    staffPermissions: {
      type: [String],
      enum: APPROVED_STAFF_PERMISSIONS,
      default: undefined,
    },
    farmerProfile: {
      type: FarmerProfileSchema,
      default: undefined,
    },
    grazingWorkerProfile: {
      type: GrazingWorkerProfileSchema,
      default: undefined,
    },
    createdBy: {
      type: String,
      default: null,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      required: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    lastLogoutAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

UserSchema.index({ userCode: 1 }, { unique: true, name: 'user_code_unique' });
UserSchema.index({ mobileNumber: 1 }, { unique: true, name: 'user_mobile_unique' });
UserSchema.index({ role: 1, status: 1 }, { name: 'user_role_status' });
UserSchema.index(
  { 'farmerProfile.businessContactMobile': 1 },
  { sparse: true, name: 'farmer_business_mobile_lookup' }
);

export function toPublicUserProfile(user: UserEntity): PublicUserProfile {
  return {
    id: user.id,
    userCode: user.userCode,
    fullName: user.fullName,
    mobileNumber: user.mobileNumber,
    role: user.role,
    status: user.status,
    statusReason: user.statusReason,
    address: user.address,
    staffPermissions:
      user.role === 'STAFF' ? (user.staffPermissions ?? []) : undefined,
    farmerProfile: user.role === 'FARMER' ? user.farmerProfile : undefined,
    grazingWorkerProfile:
      user.role === 'GRAZING_WORKER' ? user.grazingWorkerProfile : undefined,
    createdBy: user.createdBy ?? null,
    lastLoginAt: user.lastLoginAt,
    lastLogoutAt: user.lastLogoutAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const UserModel: Model<IUserDocument> =
  mongoose.models.User || mongoose.model<IUserDocument>('User', UserSchema);
