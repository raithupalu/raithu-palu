import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { CustomerNoteModel, CustomerNoteEntity, ICustomerNoteDocument } from '../models/CustomerNote';
import { env } from '../config/env';
import { AppError } from '../middleware/notFound';

function mapDoc(e: ICustomerNoteDocument): CustomerNoteEntity {
  return {
    id: e._id.toString(),
    customerId: e.customerId.toString(),
    authorId: e.authorId.toString(),
    authorCode: e.authorCode,
    body: e.body,
    isInternal: e.isInternal,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

class InMemoryNoteStore {
  private notes: CustomerNoteEntity[] = [];
  private readonly persistFilePath: string;
  constructor(customPath?: string) {
    const dataDir = path.resolve(process.cwd(), '.data');
    this.persistFilePath = customPath ?? path.join(dataDir, 'dev-notes.json');
    this.load();
  }
  private isDisk(): boolean {
    return process.env.NODE_ENV !== 'test' && env.NODE_ENV === 'development' && env.ALLOW_IN_MEMORY_AUTH_FALLBACK;
  }
  private load() {
    if (!this.isDisk() || !fs.existsSync(this.persistFilePath)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.persistFilePath,'utf8')) as CustomerNoteEntity[];
      this.notes = raw.map(r => ({ ...r, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt)}));
    } catch {}
  }
  private save() {
    if (!this.isDisk()) return;
    try {
      const dir = path.dirname(this.persistFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
      fs.writeFileSync(this.persistFilePath, JSON.stringify(this.notes,null,2),'utf8');
    } catch {}
  }
  create(customerId: string, authorId: string, authorCode: string, body: string): CustomerNoteEntity {
    const now = new Date();
    const e: CustomerNoteEntity = { id: crypto.randomBytes(12).toString('hex'), customerId, authorId, authorCode, body, isInternal:true, createdAt: now, updatedAt: now };
    this.notes.unshift(e);
    this.save();
    return { ...e };
  }
  list(customerId: string, limit=20, page=1): { notes: CustomerNoteEntity[]; total:number } {
    const filtered = this.notes.filter(n=> n.customerId===customerId).sort((a,b)=> b.createdAt.getTime()-a.createdAt.getTime());
    const total = filtered.length;
    const start=(page-1)*limit;
    return { notes: filtered.slice(start, start+limit).map(n=>({...n})), total };
  }
  clear() { this.notes=[]; this.save(); }
  snapshot(): CustomerNoteEntity[] { this.load(); return this.notes.map(n=> ({...n})); }
  restore(snap: CustomerNoteEntity[]) { this.notes = snap.map(n=> ({...n})); this.save(); }
}

export const inMemoryNoteStore = new InMemoryNoteStore();

function isMongoConnected(): boolean { return mongoose.connection.readyState===1; }
function assertStore(): 'mongo'|'memory' {
  if (isMongoConnected()) return 'mongo';
  if (env.NODE_ENV!=='production' && env.ALLOW_IN_MEMORY_AUTH_FALLBACK) return 'memory';
  throw new AppError(503,'DATABASE_UNAVAILABLE','MongoDB not active');
}

export const customerNoteRepository = {
  async create(customerId: string, authorId: string, authorCode: string, body: string, session?: mongoose.ClientSession): Promise<CustomerNoteEntity> {
    const mode = assertStore();
    if (mode==='memory') return inMemoryNoteStore.create(customerId, authorId, authorCode, body);
    if (!mongoose.Types.ObjectId.isValid(customerId) || !mongoose.Types.ObjectId.isValid(authorId)) throw new AppError(400,'VALIDATION_ERROR','Invalid IDs');
    const doc = await CustomerNoteModel.create([{
      customerId: new mongoose.Types.ObjectId(customerId),
      authorId: new mongoose.Types.ObjectId(authorId),
      authorCode,
      body,
      isInternal: true,
    }], session ? { session } : undefined);
    return mapDoc(doc[0] as ICustomerNoteDocument);
  },
  async list(customerId: string, page=1, limit=20): Promise<{ notes: CustomerNoteEntity[]; total:number }> {
    const mode = assertStore();
    if (mode==='memory') return inMemoryNoteStore.list(customerId, limit, page);
    if (!mongoose.Types.ObjectId.isValid(customerId)) return { notes:[], total:0 };
    const total = await CustomerNoteModel.countDocuments({ customerId }).exec();
    const docs = await CustomerNoteModel.find({ customerId }).sort({ createdAt:-1 }).skip((page-1)*limit).limit(limit).exec();
    return { notes: docs.map(mapDoc), total };
  }
};
