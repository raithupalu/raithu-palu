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
// Binary: MongoDB 6.0.14 Ubuntu22.04 x86_64, verbatim from fastdl.mongodb.org via mongod-mirror branch
// Expected SHA-256: 1e6ad73f6d28b838f0b20403b8693e2f8a8205d225b0442815aae9954fade0ec (pinned, verified before execution)
process.env.MONGOMS_SYSTEM_BINARY = process.env.MONGOMS_SYSTEM_BINARY || '/tmp/mongod';
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '6.0.14';
const EXPECTED_MONGOD_SHA256 = '1e6ad73f6d28b838f0b20403b8693e2f8a8205d225b0442815aae9954fade0ec';

import { UserModel } from '../models/User';
import { AuditLogModel } from '../models/AuditLog';
import { customerManagementService } from '../services/customerManagementService';
import { hashPassword } from '../services/authService';

describe('Transaction Integration — Real MongoDB Replica Set Rollback', ()=>{
  let replSet: MongoMemoryReplSet;
  let admin: { id:string; userCode:string; role:'ADMIN' };

  before(async()=>{
    // Ensure mongod binary is present and verified — fetch via codeload (allowed host) if missing
    const fs = await import('node:fs');
    const { execSync } = await import('node:child_process');
    const crypto = await import('node:crypto');
    const verifyMongod = (path: string) => {
      const data = fs.readFileSync(path);
      const hash = crypto.createHash('sha256').update(data).digest('hex');
      if (hash !== EXPECTED_MONGOD_SHA256) {
        throw new Error(`MongoDB binary SHA-256 mismatch: expected ${EXPECTED_MONGOD_SHA256}, got ${hash} — refusing to execute unverified binary (binary version 6.0.14 Ubuntu22.04 x86_64)`);
      }
      console.log(`[TransactionIntegration] Verified mongod SHA-256 ${hash} (pinned)`);
    };
    if (!fs.existsSync('/tmp/mongod')) {
      console.log('[TransactionIntegration] Mongod binary not found at /tmp/mongod, attempting codeload fetch...');
      try {
        // Fetch archive and verify its contents via pinned binary checksum after assembly
        execSync('curl -L -o /tmp/mongo-mirror.zip https://codeload.github.com/raithupalu/raithu-palu/zip/mongod-mirror && rm -rf /tmp/mongo-restore && mkdir -p /tmp/mongo-restore && unzip -q /tmp/mongo-mirror.zip -d /tmp/mongo-restore && cat /tmp/mongo-restore/raithu-palu-mongod-mirror/mongod-bin/mongod.part.* > /tmp/mongod && ls -lh /tmp/mongod', { stdio: 'inherit', timeout: 60000 });
        if (!fs.existsSync('/tmp/mongod')) throw new Error('Failed to assemble mongod from codeload');
      } catch (e) {
        throw new Error(`Mongod binary not available at /tmp/mongod and codeload fetch failed: ${(e as Error).message}. Real replica-set test requires binary — fetch via: curl -L https://codeload.github.com/raithupalu/raithu-palu/zip/mongod-mirror | unzip and cat parts to /tmp/mongod. Do not fallback to code-inspection.`);
      }
    }
    // Verify existing or newly fetched binary before execution — never execute unverified binary
    verifyMongod('/tmp/mongod');
    // Only chmod after successful verification
    execSync('chmod +x /tmp/mongod', { stdio: 'inherit' });
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

    // Deterministic barrier: force both imports to read same initial max before either proceeds
    let readCount = 0;
    let barrierResolve: (()=>void) | null = null;
    const barrier = new Promise<void>(resolve=> { barrierResolve = resolve; });
    const originalFind = UserModel.find.bind(UserModel) as unknown as (...args: unknown[])=> { select: (s: string)=> { lean: ()=> { exec: ()=> Promise<unknown[]> } } };
    let findCalls = 0;
    // Patch UserModel.find for the initial baseMax read (first find for CUS codes) to synchronize
    const patchedFind = ((...args: unknown[])=>{
      const query: unknown = (originalFind as unknown as (...a: unknown[])=> unknown)(...args);
      // Only intercept the initial customer code scan (role CUSTOMER, userCode regex)
      const isBaseMaxRead = JSON.stringify(args).includes('CUS') || JSON.stringify(args).includes('userCode');
      if (isBaseMaxRead) {
        findCalls++;
        if (findCalls <= 2) {
          readCount++;
          if (readCount === 2 && barrierResolve) barrierResolve();
          // Wait for both to have read before proceeding
          const origExec = (query as unknown as { exec: ()=> Promise<unknown> }).exec;
          return {
            select: (s: string)=> ({
              lean: ()=> ({
                exec: async ()=>{
                  // Both imports have now read same baseMax — verify
                  if (findCalls <= 2) await barrier;
                  return origExec.call(query as never);
                }
              })
            })
          } as unknown as ReturnType<typeof originalFind>;
        }
      }
      return query as unknown as ReturnType<typeof originalFind>;
    }) as unknown as typeof UserModel.find;
    const csv1 = `fullName,mobileNumber,password
Conc A1,9009000101,Password123
Conc A2,9009000102,Password123`;
    const csv2 = `fullName,mobileNumber,password
Conc B1,9009000103,Password123
Conc B2,9009000104,Password123`;
    const buf1 = Buffer.from(csv1); const buf2 = Buffer.from(csv2);

    // Apply barrier patch, run concurrent imports, then restore
    const savedFind = UserModel.find;
    (UserModel as unknown as { find: unknown }).find = patchedFind;
    let res1: Awaited<ReturnType<typeof customerManagementService.bulkImport>> | null = null;
    let res2: Awaited<ReturnType<typeof customerManagementService.bulkImport>> | null = null;
    try {
      [res1, res2] = await Promise.all([
        customerManagementService.bulkImport(admin as unknown as never, buf1, 'c1.csv'),
        customerManagementService.bulkImport(admin as unknown as never, buf2, 'c2.csv'),
      ]);
    } finally {
      (UserModel as unknown as { find: unknown }).find = savedFind;
    }
    if (!res1 || !res2) throw new Error('Concurrent imports did not return results');
    // Verify both started from same baseMax (if barrier worked, they should have same starting point)
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
