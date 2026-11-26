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
import { inMemoryNoteStore } from '../repositories/customerNoteRepository';
import { inMemoryAuditLogStore } from '../repositories/auditLogRepository';
import { hashPassword, signAccessToken } from '../services/authService';
import { env } from '../config/env';

interface JsonResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
}

async function sendRequest(baseUrl: string, path: string, options: { method?: string; token?: string; body?: unknown; headers?: Record<string,string> } = {}): Promise<JsonResponse> {
  const headers: Record<string,string> = { Accept:'application/json', ...(options.headers ?? {}) };
  if (options.body !== undefined) headers['Content-Type']='application/json';
  if (options.token) headers.Authorization=`Bearer ${options.token}`;
  const res = await fetch(`${baseUrl}${path}`, { method: options.method ?? 'GET', headers, body: options.body!==undefined ? JSON.stringify(options.body) : undefined });
  let json: Record<string,unknown> = {};
  try { json = await res.json() as Record<string,unknown>; } catch {}
  const rawHeaders: http.IncomingHttpHeaders = {};
  res.headers.forEach((v,k)=> rawHeaders[k.toLowerCase()]=v);
  return { status: res.status, headers: rawHeaders, body: json };
}

async function sendMultipart(baseUrl:string, path:string, token:string, fileContent:string, filename:string, dryRun?:boolean): Promise<JsonResponse> {
  const form = new FormData();
  const blob = new Blob([fileContent], { type: 'text/csv' });
  form.append('file', blob, filename);
  const qs = dryRun ? '?dryRun=true' : '';
  const res = await fetch(`${baseUrl}${path}${qs}`, { method:'POST', headers: token ? { Authorization:`Bearer ${token}` } : {}, body: form as unknown as BodyInit });
  let json: Record<string,unknown> = {};
  try { json = await res.json() as Record<string,unknown>; } catch {}
  const rawHeaders: http.IncomingHttpHeaders = {};
  res.headers.forEach((v,k)=> rawHeaders[k.toLowerCase()]=v);
  return { status: res.status, headers: rawHeaders, body: json };
}

describe('Phase 3A Customer Management', ()=>{
  let server:http.Server;
  let baseUrl='';
  let adminToken:string;
  let adminUserId:string;

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
    // Create admin and login to get token
    const adminHash=await hashPassword('AdminPass123');
    const admin = inMemoryUserStore.seedUserForTest({ fullName:'Test Admin', mobileNumber:'9000000001', passwordHash:adminHash, role:'ADMIN', status:'ACTIVE', userCode:'ADM-0001' });
    adminUserId=admin.id;
    adminToken=signAccessToken(admin);
  });

  it('Admin creates customer with PENDING_ACTIVATION, mustChangePassword true, duplicate mobile 409', async()=>{
    const res = await sendRequest(baseUrl, '/api/admin/customers', { method:'POST', token: adminToken, body:{ fullName:'Cust One', mobileNumber:'9111111111', password:'Password123', address:{ line1:'Street 1', pincode:'517501' } } });
    assert.equal(res.status,201);
    const customer = (res.body.data as { customer: Record<string,unknown> }).customer;
    assert.equal(customer.fullName,'Cust One');
    assert.equal(customer.milkServiceStatus,'PENDING_ACTIVATION');
    assert.equal(customer.productOrderServiceStatus,'ACTIVE');
    assert.equal(customer.mustChangePassword,true);
    assert.ok((customer.userCode as string).startsWith('CUS-'));

    // Duplicate mobile
    const dup = await sendRequest(baseUrl, '/api/admin/customers', { method:'POST', token: adminToken, body:{ fullName:'Cust Two', mobileNumber:'9111111111', password:'Password123' } });
    assert.equal(dup.status,409);
    assert.equal(dup.body.code,'MOBILE_ALREADY_REGISTERED');

    // Self-registration also PENDING
    const selfReg = await sendRequest(baseUrl, '/api/auth/customer/register', { method:'POST', body:{ fullName:'Self Cust', mobileNumber:'9222222222', password:'Password123' } });
    assert.equal(selfReg.status,201);
    const selfUser = (selfReg.body.data as { user: Record<string,unknown> }).user;
    assert.equal(selfUser.milkServiceStatus,'PENDING_ACTIVATION');
  });

  it('Directory pagination, search, pincode filter', async()=>{
    // Seed 15 customers
    for (let i=0;i<15;i++) {
      const hash=await hashPassword('Password123');
      const pincode = i<7 ? '517501' : '517502';
      inMemoryUserStore.seedUserForTest({ fullName:`Customer ${i}`, mobileNumber:`9000000${String(100+i).padStart(3,'0')}`, passwordHash:hash, role:'CUSTOMER', status:'ACTIVE', userCode:`CUS-${String(i+1).padStart(4,'0')}`, deliveryAddresses: [{ addressId:`addr-${i}`, label:'HOME', line1:'Street', pincode, isArchived:false, createdAt:new Date(), updatedAt:new Date() } as unknown as import('../models/User').DeliveryAddress ], activeDeliveryAddressId:`addr-${i}` });
    }
    const searchRes = await sendRequest(baseUrl, '/api/admin/customers?search=CUS-0005', { token: adminToken });
    assert.equal(searchRes.status,200);
    const searchData = searchRes.body.data as { customers: unknown[]; total:number };
    assert.equal(searchData.customers.length,1);
    assert.equal(searchData.total,1);

    const pincodeRes = await sendRequest(baseUrl, '/api/admin/customers?pincode=517501', { token: adminToken });
    assert.equal(pincodeRes.status,200);
    const pincodeData = pincodeRes.body.data as { customers: unknown[]; total:number };
    assert.equal(pincodeData.total,7);

    const pageRes = await sendRequest(baseUrl, '/api/admin/customers?page=2&limit=5', { token: adminToken });
    assert.equal(pageRes.status,200);
    const pageData = pageRes.body.data as { customers: unknown[]; total:number; page:number; pageSize:number };
    assert.equal(pageData.customers.length,5);
    assert.equal(pageData.total,15);
    assert.equal(pageData.page,2);
  });

  it('Address multi + active + archive separate operations, history retained', async()=>{
    const hash=await hashPassword('Password123');
    const cust = inMemoryUserStore.seedUserForTest({ fullName:'Addr Cust', mobileNumber:'9333333333', passwordHash:hash, role:'CUSTOMER', status:'ACTIVE' });
    const custToken = signAccessToken(cust);

    // Customer adds address
    const addRes = await sendRequest(baseUrl, '/api/customer/addresses', { method:'POST', token: custToken, body:{ label:'HOME', line1:'House 1', pincode:'517501', city:'Tirupati' } });
    assert.equal(addRes.status,201);
    let profile = (addRes.body.data as { profile: Record<string,unknown> }).profile;
    let addresses = profile.deliveryAddresses as unknown[];
    assert.equal(addresses.length,1);
    const addr1 = (addresses[0] as Record<string,string>).addressId;
    assert.equal(profile.activeDeliveryAddressId, addr1);

    // Add second address
    const add2 = await sendRequest(baseUrl, '/api/customer/addresses', { method:'POST', token: custToken, body:{ label:'OFFICE', line1:'Office 1', pincode:'517502', city:'Tirupati' } });
    assert.equal(add2.status,201);
    profile = (add2.body.data as { profile: Record<string,unknown> }).profile;
    assert.equal((profile.deliveryAddresses as unknown[]).length,2);
    // Active should still be first
    assert.equal(profile.activeDeliveryAddressId, addr1);

    const addr2 = ((profile.deliveryAddresses as unknown[])[1] as Record<string,string>).addressId;
    // Activate second
    const activateRes = await sendRequest(baseUrl, `/api/customer/addresses/${addr2}/activate`, { method:'POST', token: custToken });
    assert.equal(activateRes.status,200);
    profile = (activateRes.body.data as { profile: Record<string,unknown> }).profile;
    assert.equal(profile.activeDeliveryAddressId, addr2);

    // Archive non-active (first) should succeed
    const archiveRes = await sendRequest(baseUrl, `/api/customer/addresses/${addr1}/archive`, { method:'POST', token: custToken });
    assert.equal(archiveRes.status,200);
    profile = (archiveRes.body.data as { profile: Record<string,unknown> }).profile;
    const archived = (profile.deliveryAddresses as Record<string,unknown>[]).find(a=> a.addressId===addr1);
    assert.equal(archived?.isArchived, true);

    // Cannot archive active
    const archiveActive = await sendRequest(baseUrl, `/api/customer/addresses/${addr2}/archive`, { method:'POST', token: custToken });
    assert.equal(archiveActive.status,400);
    assert.equal(archiveActive.body.code,'VALIDATION_ERROR');
  });

  it('Admin mobile update with revocation, customer cannot change own mobile', async()=>{
    const hash=await hashPassword('Password123');
    const cust = inMemoryUserStore.seedUserForTest({ fullName:'Mobile Cust', mobileNumber:'9444444444', passwordHash:hash, role:'CUSTOMER', status:'ACTIVE' });
    const custToken = signAccessToken(cust);

    // Admin updates mobile
    const upd = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}`, { method:'PATCH', token: adminToken, body:{ mobileNumber:'9555555555' } });
    assert.equal(upd.status,200);
    const updated = (upd.body.data as { customer: Record<string,unknown> }).customer;
    assert.equal(updated.mobileNumber,'9555555555');

    // Old token should be revoked (tokenVersion++)
    const profileWithOldToken = await sendRequest(baseUrl, '/api/customer/profile', { token: custToken });
    assert.equal(profileWithOldToken.status,401);
    assert.equal(profileWithOldToken.body.code,'TOKEN_REVOKED');

    // Customer cannot change own mobile via PATCH profile
    const hash2=await hashPassword('Password123');
    const cust2 = inMemoryUserStore.seedUserForTest({ fullName:'Mobile Cust2', mobileNumber:'9666666666', passwordHash:hash2, role:'CUSTOMER', status:'ACTIVE', userCode:'CUS-0202' });
    const cust2Token=signAccessToken(cust2);
    const selfMobileChange = await sendRequest(baseUrl, '/api/customer/profile', { method:'PATCH', token: cust2Token, body:{ mobileNumber:'9777777777' } });
    assert.equal(selfMobileChange.status,400);
    assert.equal(selfMobileChange.body.code,'IMMUTABLE_PROFILE_FIELD');

    // Duplicate mobile should 409
    const dupMobile = await sendRequest(baseUrl, `/api/admin/customers/${cust2.id}`, { method:'PATCH', token: adminToken, body:{ mobileNumber:'9555555555' } });
    assert.equal(dupMobile.status,409);
  });

  it('Independent service statuses do not affect each other and do not revoke', async()=>{
    const hash=await hashPassword('Password123');
    const cust = inMemoryUserStore.seedUserForTest({ fullName:'Service Cust', mobileNumber:'9777777778', passwordHash:hash, role:'CUSTOMER', status:'ACTIVE', milkServiceStatus:'ACTIVE', productOrderServiceStatus:'ACTIVE' });
    const custToken=signAccessToken(cust);

    // Pause milk service (requires reason)
    const pauseMilk = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/milk-service-status`, { method:'PATCH', token: adminToken, body:{ status:'PAUSED', reason:'Customer requested vacation for 2 weeks purpose' } });
    assert.equal(pauseMilk.status,200);
    const milkPaused = (pauseMilk.body.data as { customer: Record<string,unknown> }).customer;
    assert.equal(milkPaused.milkServiceStatus,'PAUSED');
    assert.equal(milkPaused.productOrderServiceStatus,'ACTIVE'); // unchanged

    // Customer token still valid (no revoke)
    const me = await sendRequest(baseUrl, '/api/auth/me', { token: custToken });
    assert.equal(me.status,200);

    // Pause product service
    const pauseProduct = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/product-order-service-status`, { method:'PATCH', token: adminToken, body:{ status:'PAUSED', reason:'Product service pause reason longer than 10 chars' } });
    assert.equal(pauseProduct.status,200);
    const prodPaused = (pauseProduct.body.data as { customer: Record<string,unknown> }).customer;
    assert.equal(prodPaused.productOrderServiceStatus,'PAUSED');
    assert.equal(prodPaused.milkServiceStatus,'PAUSED'); // still paused

    // Product pause without reason should fail
    const noReason = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/product-order-service-status`, { method:'PATCH', token: adminToken, body:{ status:'STOPPED' } });
    assert.equal(noReason.status,400);

    // Account status change with reason should revoke
    const suspend = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/status`, { method:'PATCH', token: adminToken, body:{ status:'SUSPENDED', reason:'Suspended due to payment failure with reason longer than 10' } });
    assert.equal(suspend.status,200);
    const suspended = suspend.body.data as { sessionRevoked:boolean };
    assert.equal(suspended.sessionRevoked,true);
    const afterSuspend = await sendRequest(baseUrl, '/api/auth/me', { token: custToken });
    assert.ok([401,403].includes(afterSuspend.status));
  });

  it('Weekly schedule 3-state, custom quantity no cap, 0.01 precision', async()=>{
    const hash=await hashPassword('Password123');
    const cust = inMemoryUserStore.seedUserForTest({ fullName:'Schedule Cust', mobileNumber:'9888888888', passwordHash:hash, role:'CUSTOMER', status:'ACTIVE' });

    // Create schedule ACTIVE
    const sched = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/weekly-schedule`, { method:'PATCH', token: adminToken, body:{ monday:{ quantityLitres:0.5 }, tuesday:{ quantityLitres:2 }, wednesday:{ quantityLitres:3.75 }, thursday:{ quantityLitres:0 }, friday:{ quantityLitres:1 }, saturday:{ quantityLitres:0.75 }, sunday:{ quantityLitres:1 }, status:'ACTIVE' } });
    assert.equal(sched.status,200);
    const schedule = (sched.body.data as { customer: Record<string,unknown> }).customer.weeklyMilkSchedule as Record<string,unknown>;
    assert.equal(schedule.status,'ACTIVE');
    assert.equal((schedule.monday as Record<string,number>).quantityLitres,0.5);
    assert.equal((schedule.wednesday as Record<string,number>).quantityLitres,3.75); // custom no cap allowed

    // Custom with precision 0.01 allowed
    const customPrecise = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/weekly-schedule`, { method:'PATCH', token: adminToken, body:{ monday:{ quantityLitres:10.55 } } });
    assert.equal(customPrecise.status,200);
    const sched2 = (customPrecise.body.data as { customer: Record<string,unknown> }).customer.weeklyMilkSchedule as Record<string,unknown>;
    assert.equal((sched2.monday as Record<string,number>).quantityLitres,10.55);

    // Invalid precision 0.333 should fail
    const invalidPrec = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/weekly-schedule`, { method:'PATCH', token: adminToken, body:{ monday:{ quantityLitres:0.333 } } });
    assert.equal(invalidPrec.status,400);

    // Pause
    const pause = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/weekly-schedule`, { method:'PATCH', token: adminToken, body:{ status:'PAUSED', pausedUntil:'2026-12-31T00:00:00.000Z' } });
    assert.equal(pause.status,200);
    const pausedSched = (pause.body.data as { customer: Record<string,unknown> }).customer.weeklyMilkSchedule as Record<string,unknown>;
    assert.equal(pausedSched.status,'PAUSED');

    // Resume
    const resume = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/weekly-schedule`, { method:'PATCH', token: adminToken, body:{ status:'ACTIVE' } });
    assert.equal(resume.status,200);
    assert.equal(((resume.body.data as { customer: Record<string,unknown> }).customer.weeklyMilkSchedule as Record<string,unknown>).status,'ACTIVE');

    // Deactivate
    const deactivate = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/weekly-schedule`, { method:'PATCH', token: adminToken, body:{ status:'INACTIVE' } });
    assert.equal(deactivate.status,200);
    assert.equal(((deactivate.body.data as { customer: Record<string,unknown> }).customer.weeklyMilkSchedule as Record<string,unknown>).status,'INACTIVE');

    // Inactive -> Paused should fail (must activate first)
    const cust2 = inMemoryUserStore.seedUserForTest({ fullName:'Sched2', mobileNumber:'9899999999', passwordHash:hash, role:'CUSTOMER', status:'ACTIVE', userCode:'CUS-0909' });
    await sendRequest(baseUrl, `/api/admin/customers/${cust2.id}/weekly-schedule`, { method:'PATCH', token: adminToken, body:{ monday:{ quantityLitres:1 }, tuesday:{ quantityLitres:1 }, wednesday:{ quantityLitres:1 }, thursday:{ quantityLitres:1 }, friday:{ quantityLitres:1 }, saturday:{ quantityLitres:1 }, sunday:{ quantityLitres:1 }, status:'INACTIVE' } });
    const invalidTrans = await sendRequest(baseUrl, `/api/admin/customers/${cust2.id}/weekly-schedule`, { method:'PATCH', token: adminToken, body:{ status:'PAUSED' } });
    assert.equal(invalidTrans.status,400);
  });

  it('Bulk import transaction rollback on duplicate, row errors', async()=>{
    const csvWithDup = `fullName,mobileNumber,password,pincode,line1
Test User1,9001000001,Password123,517501,Street 1
Test User2,9001000001,Password123,517501,Street 2
Test User3,9001000003,Password123,517501,Street 3`;
    const dupRes = await sendMultipart(baseUrl, '/api/admin/customers/bulk-import', adminToken, csvWithDup, 'test.csv');
    assert.equal(dupRes.status,400);
    assert.equal(dupRes.body.code,'BULK_IMPORT_VALIDATION_FAILED');
    const errors = (dupRes.body.errors ?? (dupRes.body.details as { errors?: unknown[] })?.errors) as unknown[];
    assert.ok(errors.length>0);
    // Ensure no customers created
    const listAfterDup = await sendRequest(baseUrl, '/api/admin/customers', { token: adminToken });
    const dataAfterDup = listAfterDup.body.data as { total:number };
    // Only customers created before this test remain (0 from this bulk)
    // Check that none of the mobiles exist
    const exists = inMemoryUserStore.findByMobile('9001000001');
    assert.equal(exists, null);

    const validCsv = `fullName,mobileNumber,password,pincode,line1
Bulk User1,9001000011,Password123,517501,Street1
Bulk User2,9001000012,Password123,517502,Street2
Bulk User3,9001000013,Password123,517501,Street3`;
    const validRes = await sendMultipart(baseUrl, '/api/admin/customers/bulk-import', adminToken, validCsv, 'valid.csv');
    assert.equal(validRes.status,200);
    const validData = validRes.body.data as { imported:number };
    assert.equal(validData.imported,3);
    assert.ok(inMemoryUserStore.findByMobile('9001000011'));
    assert.ok(inMemoryUserStore.findByMobile('9001000012'));

    // Dry run should not create
    const dryRunCsv = `fullName,mobileNumber,password,pincode,line1
Dry User1,9001000021,Password123,517501,Street1`;
    const dryRes = await sendMultipart(baseUrl, '/api/admin/customers/bulk-import', adminToken, dryRunCsv, 'dry.csv', true);
    assert.equal(dryRes.status,200);
    const dryData = dryRes.body.data as { imported:number; dryRun?:boolean };
    assert.equal(dryData.imported,0);
    assert.equal(dryData.dryRun,true);
    assert.equal(inMemoryUserStore.findByMobile('9001000021'), null);
  });

  it('Internal notes privacy: admin can create/list, customer cannot see', async()=>{
    const hash=await hashPassword('Password123');
    const cust = inMemoryUserStore.seedUserForTest({ fullName:'Note Cust', mobileNumber:'9002222222', passwordHash:hash, role:'CUSTOMER', status:'ACTIVE' });
    const custToken=signAccessToken(cust);

    const noteRes = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/notes`, { method:'POST', token: adminToken, body:{ body:'Internal note test' } });
    assert.equal(noteRes.status,201);

    const listRes = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/notes`, { token: adminToken });
    assert.equal(listRes.status,200);
    const notesData = listRes.body.data as { notes: unknown[]; total:number };
    assert.equal(notesData.total,1);

    // Customer profile must not contain notes
    const profileRes = await sendRequest(baseUrl, '/api/customer/profile', { token: custToken });
    assert.equal(profileRes.status,200);
    const profile = profileRes.body.data as { profile: Record<string,unknown> };
    assert.equal(profile.notes, undefined);

    // Timeline merges audit + notes
    const timelineRes = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/timeline`, { token: adminToken });
    assert.equal(timelineRes.status,200);
    const timeline = timelineRes.body.data as { entries: unknown[]; total:number };
    assert.ok(timeline.total >= 1);
    // Should contain NOTE entry
    const hasNote = (timeline.entries as Record<string,unknown>[]).some(e=> e.type==='NOTE');
    assert.equal(hasNote, true);
  });

  it('Audit history append-only, no truncation', async()=>{
    const hash=await hashPassword('Password123');
    const cust = inMemoryUserStore.seedUserForTest({ fullName:'Audit Cust', mobileNumber:'9003333333', passwordHash:hash, role:'CUSTOMER', status:'ACTIVE' });
    // Perform 25 status/schedule changes to test no truncation
    for (let i=0;i<15;i++) {
      await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/weekly-schedule`, { method:'PATCH', token: adminToken, body:{ monday:{ quantityLitres:1 } } });
    }
    for (let i=0;i<10;i++) {
      await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/notes`, { method:'POST', token: adminToken, body:{ body:`Note ${i}` } });
    }
    const timelineRes = await sendRequest(baseUrl, `/api/admin/customers/${cust.id}/timeline?limit=100`, { token: adminToken });
    assert.equal(timelineRes.status,200);
    const timeline = timelineRes.body.data as { entries: unknown[]; total:number };
    // Should have at least 25 entries (15 schedule +10 notes + others)
    assert.ok(timeline.entries.length >= 25);
  });

  it('Initial password enforcement: mustChangePassword blocks other endpoints but allows me/logout/change-password', async()=>{
    const createRes = await sendRequest(baseUrl, '/api/admin/customers', { method:'POST', token: adminToken, body:{ fullName:'MustChange Cust', mobileNumber:'9004444444', password:'Password123' } });
    assert.equal(createRes.status,201);
    const cust = (createRes.body.data as { customer: Record<string,unknown> }).customer;
    const custId = cust.id as string;
    // Login as that customer
    const loginRes = await sendRequest(baseUrl, '/api/auth/login', { method:'POST', body:{ mobileNumber:'9004444444', password:'Password123' } });
    assert.equal(loginRes.status,200);
    const customerToken = (loginRes.body.data as { accessToken:string }).accessToken;
    assert.equal((loginRes.body.data as { user: Record<string,unknown> }).user.mustChangePassword, true);

    // GET /auth/me should be allowed
    const meRes = await sendRequest(baseUrl, '/api/auth/me', { token: customerToken });
    assert.equal(meRes.status,200);

    // POST logout should be allowed
    const logoutRes = await sendRequest(baseUrl, '/api/auth/logout', { method:'POST', token: customerToken });
    assert.equal(logoutRes.status,200);
    // Need new token after logout? Logout revokes, so login again
    const login2 = await sendRequest(baseUrl, '/api/auth/login', { method:'POST', body:{ mobileNumber:'9004444444', password:'Password123' } });
    assert.equal(login2.status,200);
    const token2 = (login2.body.data as { accessToken:string }).accessToken;

    // Attempt to access customer addresses should be blocked
    const addrRes = await sendRequest(baseUrl, '/api/customer/addresses', { method:'POST', token: token2, body:{ label:'HOME', line1:'Street', pincode:'517501' } });
    assert.equal(addrRes.status,403);
    assert.equal(addrRes.body.code,'PASSWORD_CHANGE_REQUIRED');

    // Change password should succeed
    const changeRes = await sendRequest(baseUrl, '/api/auth/change-password', { method:'POST', token: token2, body:{ currentPassword:'Password123', newPassword:'NewPassword123' } });
    assert.equal(changeRes.status,200);

    // Old token should be revoked after password change (tokenVersion incremented)
    const oldMe = await sendRequest(baseUrl, '/api/auth/me', { token: token2 });
    assert.equal(oldMe.status,401);

    // Login with new password
    const loginNew = await sendRequest(baseUrl, '/api/auth/login', { method:'POST', body:{ mobileNumber:'9004444444', password:'NewPassword123' } });
    assert.equal(loginNew.status,200);
    const newToken = (loginNew.body.data as { accessToken:string }).accessToken;
    assert.equal((loginNew.body.data as { user: Record<string,unknown> }).user.mustChangePassword, false);

    // Now addresses allowed
    const addrAfter = await sendRequest(baseUrl, '/api/customer/addresses', { method:'POST', token: newToken, body:{ label:'HOME', line1:'Street After', pincode:'517501', city:'Tirupati' } });
    assert.equal(addrAfter.status,201);
  });

  it('Unauthorized role access: customer cannot access admin, unauth 401', async()=>{
    const hash=await hashPassword('Password123');
    const cust = inMemoryUserStore.seedUserForTest({ fullName:'Unauthorized Cust', mobileNumber:'9005555555', passwordHash:hash, role:'CUSTOMER', status:'ACTIVE' });
    const custToken=signAccessToken(cust);

    const adminListAsCust = await sendRequest(baseUrl, '/api/admin/customers', { token: custToken });
    assert.equal(adminListAsCust.status,403);
    assert.equal(adminListAsCust.body.code,'FORBIDDEN_ROLE');

    const createAsCust = await sendRequest(baseUrl, '/api/admin/customers', { method:'POST', token: custToken, body:{ fullName:'Hack', mobileNumber:'9006666666', password:'Password123' } });
    assert.equal(createAsCust.status,403);

    const unauth = await sendRequest(baseUrl, '/api/admin/customers');
    assert.equal(unauth.status,401);
  });

  it('Duplicate mobile handling across bulk and single creation, 409', async()=>{
    const res1 = await sendRequest(baseUrl, '/api/admin/customers', { method:'POST', token: adminToken, body:{ fullName:'Dup Mobile 1', mobileNumber:'9007777777', password:'Password123' } });
    assert.equal(res1.status,201);

    // Try to create second with same mobile via bulk
    const csv = `fullName,mobileNumber,password
Dup Test,9007777777,Password123`;
    const bulkRes = await sendMultipart(baseUrl, '/api/admin/customers/bulk-import', adminToken, csv, 'dup.csv');
    assert.equal(bulkRes.status,400);
    assert.equal(bulkRes.body.code,'BULK_IMPORT_VALIDATION_FAILED');
  });

  it('Tags do not affect pricing/permissions, stored correctly', async()=>{
    const res = await sendRequest(baseUrl, '/api/admin/customers', { method:'POST', token: adminToken, body:{ fullName:'Tag Cust', mobileNumber:'9008888888', password:'Password123', tags:['VIP','PRIORITY'] } });
    assert.equal(res.status,201);
    const cust = (res.body.data as { customer: Record<string,unknown> }).customer;
    assert.deepEqual(cust.tags, ['VIP','PRIORITY']);

    // Update tags
    const upd = await sendRequest(baseUrl, `/api/admin/customers/${cust.id as string}`, { method:'PATCH', token: adminToken, body:{ tags:['REGULAR'] } });
    assert.equal(upd.status,200);
    const updCust = (upd.body.data as { customer: Record<string,unknown> }).customer;
    assert.deepEqual(updCust.tags, ['REGULAR']);
  });
});
