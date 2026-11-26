import mongoose, { Schema, Document, Model } from 'mongoose';

export interface CustomerNoteEntity {
  id: string;
  customerId: string;
  authorId: string;
  authorCode: string;
  body: string;
  isInternal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICustomerNoteDocument extends Document {
  customerId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  authorCode: string;
  body: string;
  isInternal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerNoteSchema = new Schema<ICustomerNoteDocument>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorCode: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    isInternal: { type: Boolean, default: true, immutable: true },
  },
  { timestamps: true, collection: 'customerNotes' }
);

CustomerNoteSchema.index({ customerId: 1, createdAt: -1 }, { name: 'customer_note_timeline' });

export const CustomerNoteModel: Model<ICustomerNoteDocument> =
  mongoose.models.CustomerNote || mongoose.model<ICustomerNoteDocument>('CustomerNote', CustomerNoteSchema);
