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

process.env.MONGOMS_SYSTEM_BINARY = process.env.MONGOMS_SYSTEM_BINARY || '/tmp/mongod';
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '6.0.14';
const EXPECTED_MONGOD_SHA256 = '1e6ad73f6d28b838f0b20403b8693e2f8a8205d225b0442815aae9954fade0ec';

import { UserModel } from '../models/User';
import { AuditLogModel } from '../models/AuditLog';
import { CustomerNoteModel } from '../models/CustomerNote';
import { customerManagementService } from '../services/customerManagementService';
import { hashPassword } from '../services/authService';

describe('Transaction Integration — Real MongoDB Replica Set Rollback', ()=>{
  let replSet: MongoMemoryReplSet;
  let admin: { id:string; userCode:string; role:'ADMIN' };

  before(async()=>{
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
        execSync('curl -L -o /tmp/mongo-mirror.zip https://codeload.github.com/raithupalu/raithu-palu/zip/mongod-mirror && rm -rf /tmp/mongo-restore && mkdir -p /tmp/mongo-restore && unzip -q /tmp/mongo-mirror.zip -d /tmp/mongo-restore && cat /tmp/mongo-restore/raithu-palu-mongod-mirror/mongod-bin/mongod.part.* > /tmp/mongod && ls -lh /tmp/mongod', { stdio: 'inherit', timeout: 60000 });
        if (!fs.existsSync('/tmp/mongod')) throw new Error('Failed to assemble mongod from codeload');
      } catch (e) {
        throw new Error(`Mongod binary not available at /tmp/mongod and codeload fetch failed: ${(e as Error).message}. Real replica-set test requires binary — fetch via: curl -L https://codeload.github.com/raithupalu/raithu-palu/zip/mongod-mirror | unzip and cat parts to /tmp/mongod. Do not fallback to code-inspection.`);
      }
    }
    verifyMongod('/tmp/mongod');
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
      assert.equal(buffer.toString().includes('Password123'), false, 'Buffer should be cleared after failure');
    }
    assert.ok(threw, 'Transaction should have thrown');

    const afterUserCount = await UserModel.countDocuments({ role:'CUSTOMER' });
    const afterAuditCount = await AuditLogModel.countDocuments({ action:'CUSTOMER_BULK_IMPORTED' });
    assert.equal(afterUserCount, initialUserCount, 'No customer records should remain after rollback — transaction rolled back user writes');
    assert.equal(afterAuditCount, initialAuditCount, 'No audit records should remain after rollback');
    console.log(`[Evidence] Rollback audit-failure: initialUsers=${initialUserCount} after=${afterUserCount} initialAudits=${initialAuditCount} after=${afterAuditCount} callCount=${callCount}`);
  });

  it('Driver retry: transient error inside bulkImport callback retries with fresh sequence, no gaps or duplicates', async()=>{
    await UserModel.deleteMany({ mobileNumber: { $in: ['9009000201','9009000202'] } });
    await AuditLogModel.deleteMany({ 'metadata.mobileNumber': { $in: ['9009000201','9009000202'] } });
    const beforeDocs = await UserModel.find({ role:'CUSTOMER' }).select('userCode').lean();
    let baseMax=0;
    for (const d of beforeDocs) { const seq=parseInt(d.userCode.slice(4),10); if (!isNaN(seq) && seq>baseMax) baseMax=seq; }

    let createCalls=0;
    let transientThrown=false;
    const origCreate = UserModel.create.bind(UserModel);
    // Patch to simulate transient error on second create of first callback invocation
    // withTransaction will retry entire callback; nextSeq must be reset inside callback or gap occurs
    // Must throw a real MongoError with TransientTransactionError label for driver to retry
    // @ts-ignore
    UserModel.create = async (docs: unknown, opts: unknown)=>{
      createCalls++;
      if (!transientThrown && createCalls===2) {
        transientThrown=true;
        const { MongoServerError } = await import('mongodb');
        const err = new MongoServerError({ errmsg: 'Simulated transient transaction error', code: 251 });
        err.addErrorLabel('TransientTransactionError');
        throw err;
      }
      return origCreate(docs as never, opts as never);
    };

    let res: Awaited<ReturnType<typeof customerManagementService.bulkImport>> | null = null;
    try {
      const csv = `fullName,mobileNumber,password
Retry One,9009000201,Password123
Retry Two,9009000202,Password123`;
      const buf = Buffer.from(csv);
      res = await customerManagementService.bulkImport(admin as unknown as never, buf, 'retry.csv');
      assert.equal(buf.toString().includes('Password123'), false, 'Buffer cleared after transient retry');
    } finally {
      UserModel.create = origCreate;
    }

    assert.ok(transientThrown, 'Transient error should have been thrown to exercise driver retry');
    assert.ok(createCalls>=3, `Expected driver retry to cause at least 3 create calls, got ${createCalls}`);
    assert.ok(res, 'Bulk import should succeed after transient retry');
    assert.equal(res!.imported,2, 'Should import 2 after retry');
    const codes = res!.customers.map(c=> parseInt(c.userCode.slice(4),10)).sort((a,b)=>a-b);
    // Verify no gaps: should be baseMax+1 and baseMax+2, not skipped
    assert.equal(codes[0], baseMax+1, `Expected first code ${baseMax+1}, got ${codes[0]} — driver retry should not skip codes`);
    assert.equal(codes[1], baseMax+2, `Expected second code ${baseMax+2}, got ${codes[1]} — driver retry should not skip codes`);
    // Verify no duplicate or partial in DB
    const dbCustomers = await UserModel.find({ mobileNumber: { $in: ['9009000201','9009000202'] } }).lean();
    assert.equal(dbCustomers.length,2, 'DB should have exactly 2 customers — no partials after transient retry');
    const dbCodes = dbCustomers.map(d=> parseInt(d.userCode.slice(4),10)).sort((a,b)=>a-b);
    assert.deepEqual(dbCodes, codes, 'DB codes should match returned codes');
    const auditCount = await AuditLogModel.countDocuments({ 'metadata.mobileNumber': { $in: ['9009000201','9009000202'] } });
    assert.equal(auditCount,2, 'Should have 2 audit records — no partial audits after transient retry');
    console.log(`[Evidence] Driver retry exercised: transientThrown=${transientThrown} createCalls=${createCalls} baseMax=${baseMax} finalCodes=${codes.join(',')} gapFree=${codes[0]===baseMax+1 && codes[1]===baseMax+2}`);

    // Cleanup
    await UserModel.deleteMany({ mobileNumber: { $in: ['9009000201','9009000202'] } });
    await AuditLogModel.deleteMany({ 'metadata.mobileNumber': { $in: ['9009000201','9009000202'] } });
  });

  it('Concurrent bulk imports with replica set produce unique codes, no duplicates, no partial imports (deterministic barrier)', async()=>{
    await UserModel.deleteMany({ mobileNumber: { $in: ['9009000101','9009000102','9009000103','9009000104'] } });
    await AuditLogModel.deleteMany({ 'metadata.mobileNumber': { $in: ['9009000101','9009000102','9009000103','9009000104'] } });
    const existing = await UserModel.find({ role:'CUSTOMER' }).select('userCode').lean();
    let initialMax=0;
    for (const d of existing) { const seq = parseInt(d.userCode.slice(4),10); if (!isNaN(seq) && seq>initialMax) initialMax=seq; }

    // Deterministic barrier capturing both max queries and proving same initial max
    let readResults: Array<Array<{userCode:string}>> = [];
    let readCount=0;
    let barrierResolve: (()=>void) | null = null;
    const barrier = new Promise<void>(resolve=> { barrierResolve = resolve; });
    const originalFind = UserModel.find.bind(UserModel) as unknown as (...args: unknown[])=> { select: (s:string)=> { lean: ()=> { exec: ()=> Promise<unknown[]> } } };
    let baseMaxFindCalls=0;
    const patchedFind = ((...args: unknown[])=>{
      const query: unknown = (originalFind as unknown as (...a: unknown[])=> unknown)(...args);
      const argsStr = JSON.stringify(args);
      const isBaseMaxRead = argsStr.includes('CUS') || (argsStr.includes('userCode') && argsStr.includes('CUSTOMER'));
      // Only intercept first two baseMax reads (initial concurrent reads)
      if (isBaseMaxRead && baseMaxFindCalls < 2) {
        baseMaxFindCalls++;
        const localCallIndex = baseMaxFindCalls;
        const origExec = (query as unknown as { exec: ()=> Promise<unknown[]> }).exec?.bind(query) ?? (query as any).exec;
        // Handle select().lean().exec() chain
        return {
          select: (s: string)=> ({
            lean: ()=> ({
              exec: async ()=>{
                // Execute actual query to capture real result
                const result = await (originalFind as unknown as (...a: unknown[])=> any)(...args).select(s).lean().exec();
                readResults.push(result as Array<{userCode:string}>);
                readCount++;
                if (readCount===2 && barrierResolve) barrierResolve();
                await barrier;
                return result;
              }
            })
          })
        } as unknown as ReturnType<typeof originalFind>;
      }
      return query as unknown as ReturnType<typeof originalFind>;
    }) as unknown as typeof UserModel.find;

    // Track duplicate conflicts via UserModel.create
    let duplicateConflictCount=0;
    const origCreate = UserModel.create.bind(UserModel);
    // @ts-ignore
    UserModel.create = async (docs: unknown, opts: unknown)=>{
      try {
        return await origCreate(docs as never, opts as never);
      } catch (e:any) {
        const msg = e.message ?? '';
        const code = e.code;
        const isDup = code===11000 || msg.includes('E11000') || msg.includes('user_code_unique');
        if (isDup) {
          const isUserCodeDup = msg.includes('userCode') || msg.includes('user_code_unique') || (e.keyPattern && 'userCode' in e.keyPattern);
          if (isUserCodeDup || msg.includes('user_code_unique')) duplicateConflictCount++;
        }
        throw e;
      }
    };

    const csv1 = `fullName,mobileNumber,password
Conc A1,9009000101,Password123
Conc A2,9009000102,Password123`;
    const csv2 = `fullName,mobileNumber,password
Conc B1,9009000103,Password123
Conc B2,9009000104,Password123`;
    const buf1 = Buffer.from(csv1); const buf2 = Buffer.from(csv2);

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
      UserModel.create = origCreate;
    }
    if (!res1 || !res2) throw new Error('Concurrent imports did not return results');

    // Evidence 1: both max queries executed and captured
    assert.equal(readResults.length,2, 'Both maximum-code queries should have executed and results captured');
    const maxFromReads = readResults.map(arr=>{
      let m=0; for (const d of arr) { const seq=parseInt(d.userCode.slice(4),10); if (!isNaN(seq) && seq>m) m=seq; } return m;
    });
    assert.equal(maxFromReads[0], initialMax, `First read should contain initialMax ${initialMax}, got ${maxFromReads[0]}`);
    assert.equal(maxFromReads[1], initialMax, `Second read should contain same initialMax ${initialMax}, got ${maxFromReads[1]}`);
    assert.equal(maxFromReads[0], maxFromReads[1], 'Both reads must contain same initial maximum before either import proceeds');

    // Evidence 2: both imports attempted same initial sequence range (first code same)
    // If both read same max, both first codes would be initialMax+1 — one should have conflicted and retried to initialMax+3
    // Verify duplicate conflict actually occurred and was retried
    assert.ok(duplicateConflictCount>=1, `Expected at least one duplicate-code conflict and complete transaction retry, got ${duplicateConflictCount} — barrier must prove conflict, not just Promise.all success`);
    console.log(`[Evidence] Concurrent deterministic: initialMax=${initialMax} readMax1=${maxFromReads[0]} readMax2=${maxFromReads[1]} duplicateConflicts=${duplicateConflictCount} retryOccurred=${duplicateConflictCount>=1}`);

    // Final verification: no duplicates, no partials, exact counts
    assert.equal(res1.imported,2, 'First concurrent import should import 2');
    assert.equal(res2.imported,2, 'Second concurrent import should import 2');
    const allCodes = [...res1.customers, ...res2.customers].map(c=> c.userCode);
    assert.equal(new Set(allCodes).size,4, 'All codes should be unique across concurrent imports — no duplicates');
    const seqs = allCodes.map(c=> parseInt(c.slice(4),10)).sort((a,b)=>a-b);
    for (let i=0;i<seqs.length;i++) assert.equal(seqs[i], initialMax+1+i, `Expected sequential code ${initialMax+1+i}, got ${seqs[i]}`);
    const dbCustomers = await UserModel.find({ mobileNumber: { $in: ['9009000101','9009000102','9009000103','9009000104'] } }).lean();
    assert.equal(dbCustomers.length, 4, 'DB should have exactly 4 new customers — no duplicates, no partials');
    const dbCodes = dbCustomers.map(d=> d.userCode);
    assert.equal(new Set(dbCodes).size, 4, 'DB codes unique');
    const auditCount = await AuditLogModel.countDocuments({ 'metadata.mobileNumber': { $in: ['9009000101','9009000102','9009000103','9009000104'] } });
    assert.equal(auditCount, 4, 'Should have 4 audit records — no partial audit imports');

    console.log(`[Evidence] Concurrent final: seqs=${seqs.join(',')} dbCount=${dbCustomers.length} auditCount=${auditCount}`);

    // Cleanup
    await UserModel.deleteMany({ mobileNumber: { $in: ['9009000101','9009000102','9009000103','9009000104'] } });
    await AuditLogModel.deleteMany({ 'metadata.mobileNumber': { $in: ['9009000101','9009000102','9009000103','9009000104'] } });
    assert.equal(buf1.toString().includes('Password123'), false, 'Buffer1 cleared');
    assert.equal(buf2.toString().includes('Password123'), false, 'Buffer2 cleared');
  });

  it('Timeline identical timestamps pagination is deterministic with no duplicates or omissions', async()=>{
    // Create a dedicated customer for timeline test with valid userCode
    const existingForCode = await UserModel.find({ role:'CUSTOMER' }).select('userCode').lean();
    let maxForCode=0; for (const d of existingForCode) { const s=parseInt(d.userCode.slice(4),10); if (!isNaN(s) && s>maxForCode) maxForCode=s; }
    const custCode = `CUS-${String(maxForCode+1).padStart(4,'0')}`;
    const custId = new mongoose.Types.ObjectId();
    await UserModel.create({
      _id: custId,
      userCode: custCode,
      fullName:'Timeline Test Customer',
      mobileNumber:'9009000401',
      passwordHash: await hashPassword('Password123'),
      role:'CUSTOMER',
      status:'ACTIVE',
      tokenVersion:0,
    });
    // Insert 35 audit logs with identical timestamp
    const fixedDate = new Date('2025-06-15T12:00:00.000Z');
    const auditDocs:any[] = [];
    for (let i=0;i<35;i++) {
      auditDocs.push({
        action:'CUSTOMER_UPDATED',
        actorId: admin.id,
        actorRole:'ADMIN',
        targetUserId: custId.toString(),
        targetUserCode: custCode,
        targetRole:'CUSTOMER',
        summary:`Timeline audit ${i}`,
        metadata:{ idx:i },
        createdAt: fixedDate,
      });
    }
    await AuditLogModel.collection.insertMany(auditDocs as any);
    // Insert 15 notes with same timestamp
    const noteDocs:any[] = [];
    for (let i=0;i<15;i++) {
      noteDocs.push({
        customerId: custId,
        authorId: new mongoose.Types.ObjectId(admin.id),
        authorCode: admin.userCode,
        body:`Timeline note ${i}`,
        isInternal:true,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      });
    }
    await CustomerNoteModel.collection.insertMany(noteDocs as any);

    // Fetch paginated timeline
    const totalExpected = 50; // 35 audits + 15 notes = 50, all same timestamp
    const page1 = await customerManagementService.getTimeline(custId.toString(), 1, 20);
    const page2 = await customerManagementService.getTimeline(custId.toString(), 2, 20);
    const page3 = await customerManagementService.getTimeline(custId.toString(), 3, 20);
    assert.equal(page1.total, totalExpected, `Total should be ${totalExpected}, got ${page1.total}`);
    assert.equal(page2.total, totalExpected);
    assert.equal(page3.total, totalExpected);
    assert.equal(page1.entries.length,20);
    assert.equal(page2.entries.length,20);
    assert.equal(page3.entries.length,10);

    // Verify no duplicates or omissions across adjacent pages
    const allIds = [...page1.entries, ...page2.entries, ...page3.entries].map(e=> e.id as string);
    const uniqueIds = new Set(allIds);
    assert.equal(uniqueIds.size, totalExpected, `All pages combined should have ${totalExpected} unique ids, got ${uniqueIds.size} — no duplicates or omissions`);
    assert.equal(allIds.length, totalExpected, 'All entries should be accounted for across pages');

    // Verify deterministic ordering: each page's entries should be sorted by _id desc within same timestamp
    // Fetch all entries in one go and compare with paginated reconstruction
    const allInOne = await customerManagementService.getTimeline(custId.toString(), 1, 50);
    const reconstructed = [...page1.entries, ...page2.entries, ...page3.entries];
    assert.deepEqual(reconstructed.map(e=>e.id), allInOne.entries.map(e=>e.id), 'Paginated reconstruction should match single large fetch — deterministic _id sort');

    // Verify adjacent pages do not duplicate boundary entries
    const page1LastId = page1.entries[page1.entries.length-1].id;
    const page2FirstId = page2.entries[0].id;
    assert.notEqual(page1LastId, page2FirstId, 'Adjacent pages should not duplicate boundary entries');
    const page2LastId = page2.entries[page2.entries.length-1].id;
    const page3FirstId = page3.entries[0].id;
    assert.notEqual(page2LastId, page3FirstId, 'Page 2 and 3 boundary should not duplicate');

    console.log(`[Evidence] Timeline pagination: total=${totalExpected} page1=${page1.entries.length} page2=${page2.entries.length} page3=${page3.entries.length} unique=${uniqueIds.size} deterministic=${uniqueIds.size===totalExpected}`);

    // Cleanup
    await UserModel.deleteOne({ _id: custId });
    await AuditLogModel.deleteMany({ targetUserId: custId.toString() });
    await CustomerNoteModel.deleteMany({ customerId: custId });
  });

  it('Customer creation rollback: audit failure before audit store modified leaves no trace', async()=>{
    const beforeCust = await UserModel.countDocuments({ role:'CUSTOMER', mobileNumber:'9009000301' });
    const beforeAudit = await AuditLogModel.countDocuments({ action:'CUSTOMER_CREATED_BY_ADMIN', 'metadata.mobileNumber':'9009000301' });
    const origCreate = AuditLogModel.create.bind(AuditLogModel);
    // @ts-ignore
    AuditLogModel.create = async ()=>{ throw new Error('Simulated audit failure before audit store modified'); };
    let threw=false;
    try {
      await customerManagementService.createCustomer(admin as unknown as never, { fullName:'Rollback Before', mobileNumber:'9009000301', password:'Password123' });
      assert.fail('Should have thrown');
    } catch (e:any) {
      threw=true;
      assert.ok(e.message.includes('Simulated audit failure before'));
    } finally {
      AuditLogModel.create = origCreate;
    }
    assert.ok(threw);
    const afterCust = await UserModel.countDocuments({ role:'CUSTOMER', mobileNumber:'9009000301' });
    const afterAudit = await AuditLogModel.countDocuments({ action:'CUSTOMER_CREATED_BY_ADMIN', 'metadata.mobileNumber':'9009000301' });
    assert.equal(afterCust, beforeCust, 'No customer should remain after audit failure before store modified');
    assert.equal(afterAudit, beforeAudit, 'No audit should remain after failure before store modified');
    console.log(`[Evidence] CreateCustomer rollback before: beforeCust=${beforeCust} afterCust=${afterCust} beforeAudit=${beforeAudit} afterAudit=${afterAudit}`);
    await UserModel.deleteMany({ mobileNumber:'9009000301' });
    await AuditLogModel.deleteMany({ 'metadata.mobileNumber':'9009000301' });
  });

  it('Customer creation rollback: audit failure after first audit in bulk leaves no partials', async()=>{
    // Reuse bulkImport rollback after scenario: first audit succeeds, second fails, verify no partials
    const beforeCust = await UserModel.countDocuments({ role:'CUSTOMER' });
    const beforeAudit = await AuditLogModel.countDocuments({ action:'CUSTOMER_BULK_IMPORTED' });
    const origCreate = AuditLogModel.create.bind(AuditLogModel);
    let callCount=0;
    // @ts-ignore
    AuditLogModel.create = async (docs: unknown, opts: unknown)=>{
      callCount++;
      if (callCount===2) throw new Error('Simulated audit failure after first audit persisted in transaction');
      return origCreate(docs as never, opts as never);
    };
    const csv = `fullName,mobileNumber,password
After One,9009000311,Password123
After Two,9009000312,Password123`;
    const buf = Buffer.from(csv);
    let threw=false;
    try {
      await customerManagementService.bulkImport(admin as unknown as never, buf, 'after.csv');
      assert.fail('Should have thrown');
    } catch (e:any) {
      threw=true;
      assert.ok(e.message.includes('Simulated audit failure after'));
    } finally {
      AuditLogModel.create = origCreate;
      assert.equal(buf.toString().includes('Password123'), false, 'Buffer cleared after second audit failure');
    }
    assert.ok(threw);
    const afterCust = await UserModel.countDocuments({ role:'CUSTOMER' });
    const afterAudit = await AuditLogModel.countDocuments({ action:'CUSTOMER_BULK_IMPORTED' });
    assert.equal(afterCust, beforeCust, 'No customer should remain after audit failure after first audit — transaction fully aborted');
    assert.equal(afterAudit, beforeAudit, 'No audit should remain after second audit failure — all rolled back');
    console.log(`[Evidence] Bulk rollback after: beforeCust=${beforeCust} afterCust=${afterCust} callCount=${callCount}`);
    await UserModel.deleteMany({ mobileNumber: { $in: ['9009000311','9009000312'] } });
    await AuditLogModel.deleteMany({ 'metadata.mobileNumber': { $in: ['9009000311','9009000312'] } });
  });
});
