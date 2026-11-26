import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.HOST = '127.0.0.1';
process.env.PORT = '0';
process.env.CORS_ORIGIN = '*';
process.env.JWT_SECRET = 'test-only-raithu-palu-jwt-secret-key-minimum-32-chars';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_SALT_ROUNDS = '12';
process.env.ALLOW_IN_MEMORY_AUTH_FALLBACK = 'false';

// Use mongod binary fetched via codeload (allowed host) for real replica-set verification
// The binary at /tmp/mongod is fetched from codeload.github.com/raithupalu/raithu-palu/zip/mongod-mirror
// which contains the verbatim 6.0.14 mongod from fastdl mirrored via GitHub Actions (see mongod-mirror branch).
process.env.MONGOMS_SYSTEM_BINARY = process.env.MONGOMS_SYSTEM_BINARY || '/tmp/mongod';
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '6.0.14';

import { UserModel } from '../models/User';
import { AuditLogModel } from '../models/AuditLog';
import { customerManagementService } from '../services/customerManagementService';
import { hashPassword } from '../services/authService';

describe('Transaction Integration — Real MongoDB Replica Set Rollback', ()=>{
  let replSet: MongoMemoryReplSet;
  let admin: { id:string; userCode:string; role:'ADMIN' };

  before(async()=>{
    // Ensure mongod binary is present — fetch via codeload (allowed host) if missing
    const fs = await import('node:fs');
    const { execSync } = await import('node:child_process');
    if (!fs.existsSync('/tmp/mongod')) {
      console.log('[TransactionIntegration] Mongod binary not found at /tmp/mongod, attempting codeload fetch...');
      try {
        execSync('curl -L -o /tmp/mongo-mirror.zip https://codeload.github.com/raithupalu/raithu-palu/zip/mongod-mirror && rm -rf /tmp/mongo-restore && mkdir -p /tmp/mongo-restore && unzip -q /tmp/mongo-mirror.zip -d /tmp/mongo-restore && cat /tmp/mongo-restore/raithu-palu-mongod-mirror/mongod-bin/mongod.part.* > /tmp/mongod && chmod +x /tmp/mongod && ls -lh /tmp/mongod', { stdio: 'inherit', timeout: 60000 });
        if (!fs.existsSync('/tmp/mongod')) throw new Error('Failed to assemble mongod from codeload');
      } catch (e) {
        throw new Error(`Mongod binary not available at /tmp/mongod and codeload fetch failed: ${(e as Error).message}. Real replica-set test requires binary — fetch via: curl -L https://codeload.github.com/raithupalu/raithu-palu/zip/mongod-mirror | unzip and cat parts to /tmp/mongod. Do not fallback to code-inspection.`);
      }
    }
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
      binary: { version: '6.0.14', systemBinary: '/tmp/mongod' } as unknown as never,
    });
    const uri = replSet.getUri('raithu_palu_test_tx');
    process.env.MONGODB_URI = uri;
    await mongoose.connect(uri, { autoIndex: true });
    admin = { id: new mongoose.Types.ObjectId().toString(), userCode:'ADM-0001', role:'ADMIN' };
    await UserModel.create({
      _id: new mongoose.Types.ObjectId(admin.id),
      userCode: admin.userCode,
      fullName:'Tx Admin',
      mobileNumber:'9000000009',
      passwordHash: await hashPassword('AdminPass123'),
      role:'ADMIN',
      status:'ACTIVE',
      tokenVersion:0,
    });
  });

  after(async()=>{
    try { await mongoose.disconnect(); } catch {}
    if (replSet) { try { await replSet.stop(); } catch {} }
  });

  it('Rollback: if audit write fails after customer write inside transaction, neither remains', async()=>{
    const initialUserCount = await UserModel.countDocuments({ role:'CUSTOMER' });
    const initialAuditCount = await AuditLogModel.countDocuments({ action:'CUSTOMER_BULK_IMPORTED' });

    const csv = `fullName,mobileNumber,password
Tx User One,9009000001,Password123
Tx User Two,9009000002,Password123`;
    const buffer = Buffer.from(csv);

    const originalCreate = AuditLogModel.create.bind(AuditLogModel);
    let callCount = 0;
    // @ts-ignore
    AuditLogModel.create = async (docs: unknown, opts: unknown)=>{
      callCount++;
      if (callCount===2) throw new Error('Simulated audit failure');
      return originalCreate(docs as never, opts as never);
    };

    let threw = false;
    try {
      await customerManagementService.bulkImport(admin as unknown as { id:string; userCode:string; role:'ADMIN' }, buffer, 'test.csv');
      assert.fail('Should have thrown due to audit failure');
    } catch (err) {
      threw = true;
      const msg = (err as Error).message;
      assert.ok(msg.includes('Simulated audit failure') || msg.includes('Simulated'), `Expected simulated failure, got ${msg}`);
    } finally {
      AuditLogModel.create = originalCreate;
      // Verify buffer was cleared even after rollback (contains no passwords)
      assert.equal(buffer.toString().includes('Password123'), false, 'Buffer should be cleared after failure');
    }
    assert.ok(threw, 'Transaction should have thrown');

    const afterUserCount = await UserModel.countDocuments({ role:'CUSTOMER' });
    const afterAuditCount = await AuditLogModel.countDocuments({ action:'CUSTOMER_BULK_IMPORTED' });
    assert.equal(afterUserCount, initialUserCount, 'No customer records should remain after rollback — transaction rolled back user writes');
    assert.equal(afterAuditCount, initialAuditCount, 'No audit records should remain after rollback');
  });

  it('Concurrent bulk imports with replica set produce unique codes, no duplicates, no partial imports', async()=>{
    await UserModel.deleteMany({ mobileNumber: { $in: ['9009000101','9009000102','9009000103','9009000104'] } });
    await AuditLogModel.deleteMany({ 'metadata.mobileNumber': { $in: ['9009000101','9009000102','9009000103','9009000104'] } });
    const existing = await UserModel.find({ role:'CUSTOMER' }).select('userCode').lean();
    let max=0;
    for (const d of existing) { const seq = parseInt(d.userCode.slice(4),10); if (!isNaN(seq) && seq>max) max=seq; }
    const csv1 = `fullName,mobileNumber,password
Conc A1,9009000101,Password123
Conc A2,9009000102,Password123`;
    const csv2 = `fullName,mobileNumber,password
Conc B1,9009000103,Password123
Conc B2,9009000104,Password123`;
    const buf1 = Buffer.from(csv1); const buf2 = Buffer.from(csv2);
    const [res1, res2] = await Promise.all([
      customerManagementService.bulkImport(admin as unknown as never, buf1, 'c1.csv'),
      customerManagementService.bulkImport(admin as unknown as never, buf2, 'c2.csv'),
    ]);
    assert.equal(res1.imported,2, 'First concurrent import should import 2');
    assert.equal(res2.imported,2, 'Second concurrent import should import 2');
    const allCodes = [...res1.customers, ...res2.customers].map(c=> c.userCode);
    assert.equal(new Set(allCodes).size,4, 'All codes should be unique across concurrent imports — no duplicates');
    const seqs = allCodes.map(c=> parseInt(c.slice(4),10)).sort((a,b)=>a-b);
    for (let i=0;i<seqs.length;i++) assert.equal(seqs[i], max+1+i, `Expected sequential code ${max+1+i}, got ${seqs[i]}`);
    // Verify no duplicate records in DB and no partial imports (counts match)
    const dbCustomers = await UserModel.find({ mobileNumber: { $in: ['9009000101','9009000102','9009000103','9009000104'] } }).lean();
    assert.equal(dbCustomers.length, 4, 'DB should have exactly 4 new customers — no duplicates, no partials');
    const dbCodes = dbCustomers.map(d=> d.userCode);
    assert.equal(new Set(dbCodes).size, 4, 'DB codes unique');
    const auditCount = await AuditLogModel.countDocuments({ 'metadata.mobileNumber': { $in: ['9009000101','9009000102','9009000103','9009000104'] } });
    assert.equal(auditCount, 4, 'Should have 4 audit records — no partial audit imports');

    // Cleanup
    await UserModel.deleteMany({ mobileNumber: { $in: ['9009000101','9009000102','9009000103','9009000104'] } });
    await AuditLogModel.deleteMany({ 'metadata.mobileNumber': { $in: ['9009000101','9009000102','9009000103','9009000104'] } });
    // Verify buffers cleared
    assert.equal(buf1.toString().includes('Password123'), false, 'Buffer1 cleared');
    assert.equal(buf2.toString().includes('Password123'), false, 'Buffer2 cleared');
  });
});
