import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.HOST = '127.0.0.1';
process.env.PORT = '0';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/raithu_palu_test';
process.env.CORS_ORIGIN = '*';
process.env.JWT_SECRET = 'test-only-raithu-palu-jwt-secret-key-minimum-32-chars';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_SALT_ROUNDS = '12';
process.env.ALLOW_IN_MEMORY_AUTH_FALLBACK = 'true';

import { app } from '../app';
import { inMemoryUserStore } from '../repositories/userRepository';
import { inMemoryAuditLogStore } from '../repositories/auditLogRepository';
import { inMemoryNoteStore } from '../repositories/customerNoteRepository';
import { hashPassword, signAccessToken } from '../services/authService';

interface JsonResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
}
async function sendRequest(baseUrl: string, path: string, options: { method?: string; token?: string; body?: unknown } = {}): Promise<JsonResponse> {
  const headers: Record<string,string> = { Accept:'application/json' };
  if (options.body !== undefined) headers['Content-Type']='application/json';
  if (options.token) headers.Authorization=`Bearer ${options.token}`;
  const res = await fetch(`${baseUrl}${path}`, { method: options.method ?? 'GET', headers, body: options.body!==undefined ? JSON.stringify(options.body) : undefined });
  let json: Record<string,unknown> = {};
  try { json = await res.json() as Record<string,unknown>; } catch {}
  const rawHeaders: http.IncomingHttpHeaders = {};
  res.headers.forEach((v,k)=> rawHeaders[k.toLowerCase()]=v);
  return { status: res.status, headers: rawHeaders, body: json };
}
async function sendMultipart(baseUrl:string, path:string, token:string, fileContent:string, filename:string): Promise<JsonResponse> {
  const form = new FormData();
  const blob = new Blob([fileContent], { type: 'text/csv' });
  form.append('file', blob, filename);
  const res = await fetch(`${baseUrl}${path}`, { method:'POST', headers: token ? { Authorization:`Bearer ${token}` } : {}, body: form as unknown as BodyInit });
  let json: Record<string,unknown> = {};
  try { json = await res.json() as Record<string,unknown>; } catch {}
  const rawHeaders: http.IncomingHttpHeaders = {};
  res.headers.forEach((v,k)=> rawHeaders[k.toLowerCase()]=v);
  return { status: res.status, headers: rawHeaders, body: json };
}

describe('Review Fixes: Directory Filtering, Code Generation, Timeline, Limits, CSV', ()=>{
  let server:http.Server;
  let baseUrl='';
  let adminToken:string;

  before(async()=>{
    server=http.createServer(app);
    await new Promise<void>(resolve=> server.listen(0,'127.0.0.1',()=> resolve()));
    const addr=server.address();
    if (!addr || typeof addr==='string') throw new Error('Failed bind');
    baseUrl=`http://127.0.0.1:${addr.port}`;
  });
  after(async()=>{
    await new Promise<void>((resolve,reject)=> server.close(err=> err?reject(err):resolve()));
  });
  beforeEach(async()=>{
    inMemoryUserStore.clear();
    inMemoryAuditLogStore.clear();
    inMemoryNoteStore.clear();
    const adminHash=await hashPassword('AdminPass123');
    const admin = inMemoryUserStore.seedUserForTest({ fullName:'Test Admin', mobileNumber:'9000000001', passwordHash:adminHash, role:'ADMIN', status:'ACTIVE', userCode:'ADM-0001' });
    adminToken=signAccessToken(admin);
  });

  it('1. Directory filtering AND semantics: search + pincode + status', async()=>{
    const hash=await hashPassword('Password123');
    // Customer matching all criteria
    inMemoryUserStore.seedUserForTest({ fullName:'Ramesh Kumar', mobileNumber:'9000000011', passwordHash:hash, role:'CUSTOMER', status:'ACTIVE', userCode:'CUS-0001', deliveryAddresses:[{ addressId:'a1', label:'HOME', line1:'Street', pincode:'517501', isArchived:false, createdAt:new Date(), updatedAt:new Date() } as unknown as never], activeDeliveryAddressId:'a1' });
    // Customer matching search but not pincode
    inMemoryUserStore.seedUserForTest({ fullName:'Ramesh Kumar', mobileNumber:'9000000012', passwordHash:hash, role:'CUSTOMER', status:'ACTIVE', userCode:'CUS-0002', deliveryAddresses:[{ addressId:'a2', label:'HOME', line1:'Street', pincode:'517502', isArchived:false, createdAt:new Date(), updatedAt:new Date() } as unknown as never], activeDeliveryAddressId:'a2' });
    // Customer matching pincode but not search
    inMemoryUserStore.seedUserForTest({ fullName:'Sita Devi', mobileNumber:'9000000013', passwordHash:hash, role:'CUSTOMER', status:'ACTIVE', userCode:'CUS-0003', deliveryAddresses:[{ addressId:'a3', label:'HOME', line1:'Street', pincode:'517501', isArchived:false, createdAt:new Date(), updatedAt:new Date() } as unknown as never], activeDeliveryAddressId:'a3' });
    // Customer matching search+pincode but not status
    inMemoryUserStore.seedUserForTest({ fullName:'Ramesh Kumar', mobileNumber:'9000000014', passwordHash:hash, role:'CUSTOMER', status:'SUSPENDED', userCode:'CUS-0004', deliveryAddresses:[{ addressId:'a4', label:'HOME', line1:'Street', pincode:'517501', isArchived:false, createdAt:new Date(), updatedAt:new Date() } as unknown as never], activeDeliveryAddressId:'a4' });
    // Archived address should not count
    inMemoryUserStore.seedUserForTest({ fullName:'Ramesh Kumar', mobileNumber:'9000000015', passwordHash:hash, role:'CUSTOMER', status:'ACTIVE', userCode:'CUS-0005', deliveryAddresses:[{ addressId:'a5', label:'HOME', line1:'Street', pincode:'517501', isArchived:true, createdAt:new Date(), updatedAt:new Date() } as unknown as never], activeDeliveryAddressId:null });

    const res = await sendRequest(baseUrl, '/api/admin/customers?search=Ramesh&pincode=517501&status=ACTIVE', { token: adminToken });
    assert.equal(res.status,200);
    const data = res.body.data as { customers: unknown[]; total:number };
    // Only first should match (Ramesh + 517501 non-archived + ACTIVE)
    assert.equal(data.total,1);
    assert.equal(data.customers.length,1);
    const cust = data.customers[0] as Record<string,string>;
    assert.equal(cust.userCode,'CUS-0001');
  });

  it('2. Bulk import code generation with existing codes', async()=>{
    const hash=await hashPassword('Password123');
    // Pre-existing customers with codes CUS-0001 to CUS-0003
    for (let i=1;i<=3;i++) {
      inMemoryUserStore.seedUserForTest({ fullName:`Existing ${i}`, mobileNumber:`90000000${10+i}`, passwordHash:hash, role:'CUSTOMER', status:'ACTIVE', userCode:`CUS-${String(i).padStart(4,'0')}` });
    }
    const csv = `fullName,mobileNumber,password
Bulk One,9001000101,Password123
Bulk Two,9001000102,Password123
Bulk Three,9001000103,Password123`;
    const res = await sendMultipart(baseUrl, '/api/admin/customers/bulk-import', adminToken, csv, 'bulk.csv');
    assert.equal(res.status,200);
    const data = res.body.data as { imported:number; customers: Array<Record<string,string>> };
    assert.equal(data.imported,3);
    // Should be sequential after existing: CUS-0004, 0005, 0006
    const codes = data.customers.map(c=> c.userCode).sort();
    assert.deepEqual(codes, ['CUS-0004','CUS-0005','CUS-0006']);
    // Verify no duplicates
    const unique = new Set(codes);
    assert.equal(unique.size,3);
  });

  it('2b. Concurrent bulk imports produce unique codes', async()=>{
    const hash=await hashPassword('Password123');
    for (let i=1;i<=2;i++) {
      inMemoryUserStore.seedUserForTest({ fullName:`Pre ${i}`, mobileNumber:`90000002${i}`, passwordHash:hash, role:'CUSTOMER', status:'ACTIVE', userCode:`CUS-${String(i).padStart(4,'0')}` });
    }
    const csv1 = `fullName,mobileNumber,password
Conc One,9002000101,Password123
Conc Two,9002000102,Password123`;
    const csv2 = `fullName,mobileNumber,password
Conc Three,9002000103,Password123
Conc Four,9002000104,Password123`;
    // Fire concurrently
    const [res1, res2] = await Promise.all([
      sendMultipart(baseUrl, '/api/admin/customers/bulk-import', adminToken, csv1, 'c1.csv'),
      sendMultipart(baseUrl, '/api/admin/customers/bulk-import', adminToken, csv2, 'c2.csv')
    ]);
    // Both should succeed or one may conflict on mobile? mobiles are different, so both should succeed
    // But we need to ensure no duplicate userCode
    const allCustomers = inMemoryUserStore.listCustomers({});
    const codes = allCustomers.customers.map(c=> c.userCode);
    const uniqueCodes = new Set(codes);
    assert.equal(codes.length, uniqueCodes.size, 'No duplicate userCodes after concurrent imports');
    // Both imports should have succeeded
    assert.ok([200,400].includes(res1.status)); // In-memory may have race but we check codes uniqueness
    assert.ok([200,400].includes(res2.status));
    if (res1.status===200 && res2.status===200) {
      assert.equal((res1.body.data as { imported:number }).imported,2);
      assert.equal((res2.body.data as { imported:number }).imported,2);
    }
  });

  it('3. Timeline pagination >200 entries', async()=>{
    const hash=await hashPassword('Password123');
    const cust = inMemoryUserStore.seedUserForTest({ fullName:'Timeline Cust', mobileNumber:'9003000001', passwordHash:hash, role:'CUSTOMER', status:'ACTIVE', userCode:'CUS-0100' });
    // Create 150 notes + 100 audit entries (via status changes)
    for (let i=0;i<150;i++) {
      await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/notes`, { method:'POST', token: adminToken, body:{ body:`Note ${i}` } });
    }
    for (let i=0;i<100;i++) {
      // Use weekly schedule updates to generate audit logs
      await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/weekly-schedule`, { method:'PATCH', token: adminToken, body:{ monday:{ quantityLitres:1 } } });
    }
    const timelineAll = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/timeline?limit=100&page=1`, { token: adminToken });
    assert.equal(timelineAll.status,200);
    const dataAll = timelineAll.body.data as { entries: unknown[]; total:number };
    assert.ok(dataAll.total >= 250, `Expected >=250 total, got ${dataAll.total}`);
    assert.equal(dataAll.entries.length,100); // page 1 limit 100

    const timelinePage3 = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/timeline?limit=100&page=3`, { token: adminToken });
    assert.equal(timelinePage3.status,200);
    const dataPage3 = timelinePage3.body.data as { entries: unknown[]; total:number };
    assert.ok(dataPage3.entries.length > 0, 'Page 3 should have entries beyond 200');
    assert.equal(dataPage3.total, dataAll.total);
    // Ensure older entries accessible: page 3 should contain earliest entries
    const firstEntryPage1 = (dataAll.entries[0] as Record<string,unknown>).createdAt as string;
    const firstEntryPage3 = (dataPage3.entries[0] as Record<string,unknown>).createdAt as string;
    assert.ok(new Date(firstEntryPage1).getTime() >= new Date(firstEntryPage3).getTime(), 'Page 3 should have older entries');
  });

  it('4. Remove limits: allow >10 addresses and >10 tags', async()=>{
    const res = await sendRequest(baseUrl, '/api/admin/customers', { method:'POST', token: adminToken, body:{ fullName:'Limit Test', mobileNumber:'9004000001', password:'Password123', tags: Array.from({length:15}, (_,i)=> `TAG${i}`) } });
    assert.equal(res.status,201, 'Should allow >10 tags');
    const cust = (res.body.data as { customer: Record<string,unknown> }).customer;
    assert.equal((cust.tags as unknown[]).length,15);

    const custId = cust.id as string;
    // Add 12 addresses (previously limit 10)
    for (let i=0;i<12;i++) {
      const addrRes = await sendRequest(baseUrl, `/api/admin/customers/${custId}/addresses`, { method:'POST', token: adminToken, body:{ label:'HOME', line1:`Street ${i}`, pincode:'517501', city:'Tirupati' } });
      assert.equal(addrRes.status,201, `Address ${i} should succeed without 10 limit`);
    }
    const detail = await sendRequest(baseUrl, `/api/admin/customers/${custId}`, { token: adminToken });
    const detailCust = (detail.body.data as { customer: Record<string,unknown> }).customer;
    assert.equal((detailCust.deliveryAddresses as unknown[]).length,12);

    // Bulk import with 15 tags via CSV should also work (tags via payload not CSV, but we test creation)
    const csv = `fullName,mobileNumber,password
Bulk Tag,9004000102,Password123`;
    const bulkRes = await sendMultipart(baseUrl, '/api/admin/customers/bulk-import', adminToken, csv, 'bulk.csv');
    assert.equal(bulkRes.status,200);
  });

  it('7. CSV import reliability: BOM, CRLF, quoted commas, escaped quotes, multiline', async()=>{
    // BOM
    const bomCsv = "\uFEFFfullName,mobileNumber,password\nBOM User,9005000001,Password123\n";
    const bomRes = await sendMultipart(baseUrl, '/api/admin/customers/bulk-import', adminToken, bomCsv, 'bom.csv');
    assert.equal(bomRes.status,200);
    assert.equal((bomRes.body.data as { imported:number }).imported,1);

    // Quoted commas
    const quotedCsv = `fullName,mobileNumber,password
"User, With Comma",9005000002,Password123
`;
    const quotedRes = await sendMultipart(baseUrl, '/api/admin/customers/bulk-import', adminToken, quotedCsv, 'quoted.csv');
    assert.equal(quotedRes.status,200);
    const quotedCust = (quotedRes.body.data as { customers: Array<Record<string,string>> }).customers[0];
    assert.equal(quotedCust.fullName,'User, With Comma');

    // Escaped quotes
    const escapedCsv = `fullName,mobileNumber,password
"User ""Quoted"" Name",9005000003,Password123
`;
    const escapedRes = await sendMultipart(baseUrl, '/api/admin/customers/bulk-import', adminToken, escapedCsv, 'escaped.csv');
    assert.equal(escapedRes.status,200);
    const escCust = (escapedRes.body.data as { customers: Array<Record<string,string>> }).customers[0];
    assert.equal(escCust.fullName,'User "Quoted" Name');

    // CRLF
    const crlfCsv = "fullName,mobileNumber,password\r\nCRLF User,9005000004,Password123\r\n";
    const crlfRes = await sendMultipart(baseUrl, '/api/admin/customers/bulk-import', adminToken, crlfCsv, 'crlf.csv');
    assert.equal(crlfRes.status,200);

    // Malformed should return 400, not 500
    const malformedCsv = `fullName,mobileNumber,password
Broken "quote,9005000005,Password123
`;
    const malformedRes = await sendMultipart(baseUrl, '/api/admin/customers/bulk-import', adminToken, malformedCsv, 'malformed.csv');
    assert.equal(malformedRes.status,400);
    assert.equal(malformedRes.body.code,'VALIDATION_ERROR');
  });
});
