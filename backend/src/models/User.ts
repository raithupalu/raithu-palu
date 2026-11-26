import mongoose, { Schema, Document, Model } from 'mongoose';

export type UserRole =
  | 'ADMIN'
  | 'CUSTOMER'
  | 'STAFF'
  | 'FARMER'
  | 'GRAZING_WORKER';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface CustomerAddress {
  line1?: string;
  line2?: string;
  landmark?: string;
  city?: string;
  pincode?: string;
  deliveryNotes?: string;
}

export interface UserEntity {
  id: string;
  fullName: string;
  mobileNumber: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  address?: CustomerAddress;
  tokenVersion: number;
  lastLoginAt: Date | null;
  lastLogoutAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PublicUserProfile = Omit<UserEntity, 'passwordHash' | 'tokenVersion'>;

export interface IUserDocument extends Document {
  fullName: string;
  mobileNumber: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  address?: CustomerAddress;
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

const UserSchema = new Schema<IUserDocument>(
  {
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
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
      default: 'ACTIVE',
      required: true,
    },
    address: {
      type: CustomerAddressSchema,
      default: undefined,
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

UserSchema.index({ mobileNumber: 1 }, { unique: true, name: 'user_mobile_unique' });
UserSchema.index({ role: 1, status: 1 }, { name: 'user_role_status' });

export function toPublicUserProfile(user: UserEntity): PublicUserProfile {
  return {
    id: user.id,
    fullName: user.fullName,
    mobileNumber: user.mobileNumber,
    role: user.role,
    status: user.status,
    address: user.address,
    lastLoginAt: user.lastLoginAt,
    lastLogoutAt: user.lastLogoutAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const UserModel: Model<IUserDocument> =
  mongoose.models.User || mongoose.model<IUserDocument>('User', UserSchema);
