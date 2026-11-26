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
process.env.BCRYPT_SALT_ROUNDS = '10';
process.env.ALLOW_IN_MEMORY_AUTH_FALLBACK = 'true';

import { app } from '../app';
import { inMemoryUserStore } from '../repositories/userRepository';
import { hashPassword } from '../services/authService';

async function sendRequest(baseUrl: string, path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body, headers: res.headers };
}

describe('Unified Login & Role-Based Access Suite', () => {
  let server: http.Server;
  let baseUrl = '';
  const pwd = 'StrongPass123';

  before(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as import('net').AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });
  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  beforeEach(() => {
    inMemoryUserStore.clear();
  });

  async function seed(role: string, mobile: string, status = 'ACTIVE') {
    const hash = await hashPassword(pwd);
    return inMemoryUserStore.seedUserForTest({ fullName: `${role} User`, mobileNumber: mobile, passwordHash: hash, role: role as any, status: status as any });
  }

  it('unified login authenticates all five roles via /auth/login and returns DB role', async () => {
    const cases: [string, string][] = [
      ['ADMIN', '9000000001'],
      ['CUSTOMER', '9000000002'],
      ['STAFF', '9000000003'],
      ['FARMER', '9000000004'],
      ['GRAZING_WORKER', '9000000005'],
    ];
    for (const [role, mobile] of cases) {
      await seed(role, mobile);
      const res = await sendRequest(baseUrl, '/api/auth/login', { method: 'POST', body: { mobileNumber: mobile, password: pwd } });
      assert.equal(res.status, 200, `login should succeed for ${role}: ${JSON.stringify(res.body)}`);
      const user = (res.body.data as any)?.user ?? (res.body as any).user;
      assert.equal(user.role, role, `role should be ${role} from DB`);
      assert.equal(user.passwordHash, undefined, 'passwordHash must never be returned');
      // token should work for /api/auth/me
      const token = (res.body.data as any)?.accessToken ?? (res.body as any).accessToken;
      const me = await sendRequest(baseUrl, '/api/auth/me', { token });
      assert.equal(me.status, 200);
      const meUser = (me.body.data as any)?.user;
      assert.equal(meUser.role, role);
    }
  });

  it('rejects invalid credentials uniformly', async () => {
    await seed('ADMIN', '9000000101');
    const res = await sendRequest(baseUrl, '/api/auth/login', { method: 'POST', body: { mobileNumber: '9000000101', password: 'Wrong1234' } });
    assert.equal(res.status, 401);
    assert.match(String((res.body as any).code), /INVALID_CREDENTIALS/);
  });

  it('rejects INACTIVE, SUSPENDED, BLOCKED accounts', async () => {
    const cases: [string, string][] = [
      ['INACTIVE', '9000000211'],
      ['SUSPENDED', '9000000212'],
      ['BLOCKED', '9000000213'],
    ];
    for (const [status, mobile] of cases) {
      await seed('STAFF', mobile, status);
      const res = await sendRequest(baseUrl, '/api/auth/login', { method: 'POST', body: { mobileNumber: mobile, password: pwd } });
      assert.equal(res.status, 403, `status ${status} should be rejected: ${JSON.stringify(res.body)}`);
      assert.match(String((res.body as any).code), /ACCOUNT_INACTIVE/);
    }
  });

  it('protects role-specific endpoints — does not trust frontend role', async () => {
    await seed('CUSTOMER', '9000000301');
    await seed('STAFF', '9000000302');
    await seed('FARMER', '9000000303');
    await seed('GRAZING_WORKER', '9000000304');
    await seed('ADMIN', '9000000305');

    const tokens: Record<string, string> = {};
    for (const [role, mobile] of Object.entries({ CUSTOMER: '9000000301', STAFF: '9000000302', FARMER: '9000000303', GRAZING_WORKER: '9000000304', ADMIN: '9000000305' })) {
      const r = await sendRequest(baseUrl, '/api/auth/login', { method: 'POST', body: { mobileNumber: mobile, password: pwd } });
      tokens[role] = (r.body.data as any).accessToken;
    }

    // Customer cannot access admin
    const adminByCustomer = await sendRequest(baseUrl, '/api/admin/accounts', { token: tokens.CUSTOMER });
    assert.equal(adminByCustomer.status, 403);
    // Non-customer cannot access customer profile
    const custByAdmin = await sendRequest(baseUrl, '/api/customer/profile', { token: tokens.ADMIN });
    assert.equal(custByAdmin.status, 403);
    const custByStaff = await sendRequest(baseUrl, '/api/customer/profile', { token: tokens.STAFF });
    assert.equal(custByStaff.status, 403);
    // Farmer cannot access staff views without permission
    const staffViewByFarmer = await sendRequest(baseUrl, '/api/staff/views/customers', { token: tokens.FARMER });
    assert.equal(staffViewByFarmer.status, 403);
  });

  it('preserves session after refresh via /auth/me and handles logout revocation', async () => {
    await seed('CUSTOMER', '9000000401');
    const login = await sendRequest(baseUrl, '/api/auth/login', { method: 'POST', body: { mobileNumber: '9000000401', password: pwd } });
    const token = (login.body.data as any).accessToken as string;
    assert.ok(token);
    // session persistence: repeated /me succeeds
    for (let i = 0; i < 2; i++) {
      const me = await sendRequest(baseUrl, '/api/auth/me', { token });
      assert.equal(me.status, 200);
    }
    // logout
    const logout = await sendRequest(baseUrl, '/api/auth/logout', { method: 'POST', token });
    assert.equal(logout.status, 200);
    // protected access after logout must fail with 401 TOKEN_REVOKED or INVALID_OR_EXPIRED_TOKEN
    const after = await sendRequest(baseUrl, '/api/auth/me', { token });
    assert.equal(after.status, 401);
  });

  it('unauthenticated access to protected routes returns 401', async () => {
    const res = await sendRequest(baseUrl, '/api/auth/me');
    assert.equal(res.status, 401);
    const r2 = await sendRequest(baseUrl, '/api/admin/accounts');
    assert.equal(r2.status, 401);
    const r3 = await sendRequest(baseUrl, '/api/customer/profile');
    assert.equal(r3.status, 401);
  });
});
