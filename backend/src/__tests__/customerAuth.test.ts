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
import { hashPassword, signAccessToken } from '../services/authService';

interface JsonResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
}

async function sendRequest(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
  } = {}
): Promise<JsonResponse> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const json = (await res.json()) as Record<string, unknown>;
  const rawHeaders: http.IncomingHttpHeaders = {};
  res.headers.forEach((value, key) => {
    rawHeaders[key.toLowerCase()] = value;
  });

  return {
    status: res.status,
    headers: rawHeaders,
    body: json,
  };
}

describe('Phase 1 Step 1: Customer Authentication Foundation (In-Memory Repository Harness)', () => {
  let server: http.Server;
  let baseUrl = '';

  before(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to bind test HTTP server');
    }
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    inMemoryUserStore.clear();
  });

  it('registers a customer with fullName, mobileNumber, and password and hashes the password', async () => {
    const res = await sendRequest(baseUrl, '/api/auth/customer/register', {
      method: 'POST',
      body: {
        fullName: 'Rama Rao',
        mobileNumber: '9876543210',
        password: 'DairyPassword123',
        address: {
          line1: '14-2 Temple Street',
          city: 'Tirupati',
          pincode: '517501',
        },
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'ok');

    const data = res.body.data as {
      user: Record<string, unknown>;
      accessToken: string;
    };
    assert.ok(data.accessToken);
    assert.equal(data.user.fullName, 'Rama Rao');
    assert.equal(data.user.mobileNumber, '9876543210');
    assert.equal(data.user.role, 'CUSTOMER');
    assert.equal(data.user.status, 'ACTIVE');
    assert.equal(data.user.passwordHash, undefined);
    assert.equal(data.user.tokenVersion, undefined);

    const stored = inMemoryUserStore.findByMobile('9876543210');
    assert.ok(stored);
    assert.notEqual(stored.passwordHash, 'DairyPassword123');
    assert.match(stored.passwordHash, /^\$2[ab]\$10\$/);
  });

  it('rejects duplicate mobile number registration with 409 MOBILE_ALREADY_REGISTERED', async () => {
    await sendRequest(baseUrl, '/api/auth/customer/register', {
      method: 'POST',
      body: {
        fullName: 'First Customer',
        mobileNumber: '9123456789',
        password: 'Password123',
      },
    });

    const dupRes = await sendRequest(baseUrl, '/api/auth/customer/register', {
      method: 'POST',
      body: {
        fullName: 'Second Customer',
        mobileNumber: '+91 91234-56789',
        password: 'Password456',
      },
    });

    assert.equal(dupRes.status, 409);
    assert.equal(dupRes.body.code, 'MOBILE_ALREADY_REGISTERED');
  });

  it('blocks privilege escalation attempts to register ADMIN or STAFF roles publicly', async () => {
    const adminAttempt = await sendRequest(
      baseUrl,
      '/api/auth/customer/register',
      {
        method: 'POST',
        body: {
          fullName: 'Malicious User',
          mobileNumber: '9988776655',
          password: 'Password123',
          role: 'ADMIN',
        },
      }
    );

    assert.equal(adminAttempt.status, 403);
    assert.equal(adminAttempt.body.code, 'FORBIDDEN_ROLE_ASSIGNMENT');
  });

  it('validates mobile number and password strength on registration', async () => {
    const badMobile = await sendRequest(
      baseUrl,
      '/api/auth/customer/register',
      {
        method: 'POST',
        body: {
          fullName: 'Valid Name',
          mobileNumber: '12345',
          password: 'Password123',
        },
      }
    );
    assert.equal(badMobile.status, 400);
    assert.equal(badMobile.body.code, 'VALIDATION_ERROR');

    const weakPassword = await sendRequest(
      baseUrl,
      '/api/auth/customer/register',
      {
        method: 'POST',
        body: {
          fullName: 'Valid Name',
          mobileNumber: '9876543211',
          password: 'short',
        },
      }
    );
    assert.equal(weakPassword.status, 400);
    assert.equal(weakPassword.body.code, 'VALIDATION_ERROR');
  });

  it('authenticates valid customer login and rejects invalid credentials', async () => {
    await sendRequest(baseUrl, '/api/auth/customer/register', {
      method: 'POST',
      body: {
        fullName: 'Sita Devi',
        mobileNumber: '9440112233',
        password: 'SecurePassword99',
      },
    });

    const loginRes = await sendRequest(baseUrl, '/api/auth/customer/login', {
      method: 'POST',
      body: {
        mobileNumber: '9440112233',
        password: 'SecurePassword99',
      },
    });
    assert.equal(loginRes.status, 200);
    const loginData = loginRes.body.data as {
      user: Record<string, unknown>;
      accessToken: string;
    };
    assert.ok(loginData.accessToken);
    assert.equal(loginData.user.mobileNumber, '9440112233');

    const wrongPassRes = await sendRequest(
      baseUrl,
      '/api/auth/customer/login',
      {
        method: 'POST',
        body: {
          mobileNumber: '9440112233',
          password: 'WrongPassword99',
        },
      }
    );
    assert.equal(wrongPassRes.status, 401);
    assert.equal(wrongPassRes.body.code, 'INVALID_CREDENTIALS');

    const unknownMobileRes = await sendRequest(
      baseUrl,
      '/api/auth/customer/login',
      {
        method: 'POST',
        body: {
          mobileNumber: '9000000001',
          password: 'SecurePassword99',
        },
      }
    );
    assert.equal(unknownMobileRes.status, 401);
    assert.equal(unknownMobileRes.body.code, 'INVALID_CREDENTIALS');
  });

  it('enforces authentication and CUSTOMER role authorization on /api/customer/profile', async () => {
    const unauthRes = await sendRequest(baseUrl, '/api/customer/profile');
    assert.equal(unauthRes.status, 401);
    assert.equal(unauthRes.body.code, 'AUTHENTICATION_REQUIRED');

    const staffHash = await hashPassword('StaffPass123');
    const staffUser = inMemoryUserStore.seedUserForTest({
      fullName: 'Staff Member',
      mobileNumber: '9777777777',
      passwordHash: staffHash,
      role: 'STAFF',
      status: 'ACTIVE',
    });
    const staffToken = signAccessToken(staffUser);

    const forbiddenRes = await sendRequest(baseUrl, '/api/customer/profile', {
      token: staffToken,
    });
    assert.equal(forbiddenRes.status, 403);
    assert.equal(forbiddenRes.body.code, 'FORBIDDEN_ROLE');
  });

  it('allows authenticated customer to view and update profile, and revokes token on logout', async () => {
    const regRes = await sendRequest(baseUrl, '/api/auth/customer/register', {
      method: 'POST',
      body: {
        fullName: 'Venkatesh K',
        mobileNumber: '9333444555',
        password: 'MilkOrder123',
      },
    });
    const token = (regRes.body.data as { accessToken: string }).accessToken;

    const profileRes = await sendRequest(baseUrl, '/api/customer/profile', {
      token,
    });
    assert.equal(profileRes.status, 200);

    const updateRes = await sendRequest(baseUrl, '/api/customer/profile', {
      method: 'PATCH',
      token,
      body: {
        fullName: 'Venkatesh Kumar',
        address: {
          line1: 'Flat 302, Balaji Enclave',
          city: 'Tirupati',
          pincode: '517507',
        },
      },
    });
    assert.equal(updateRes.status, 200);
    const updatedProfile = (
      updateRes.body.data as { profile: Record<string, unknown> }
    ).profile;
    assert.equal(updatedProfile.fullName, 'Venkatesh Kumar');

    const immutableAttempt = await sendRequest(
      baseUrl,
      '/api/customer/profile',
      {
        method: 'PATCH',
        token,
        body: {
          role: 'ADMIN',
        },
      }
    );
    assert.equal(immutableAttempt.status, 400);
    assert.equal(immutableAttempt.body.code, 'IMMUTABLE_PROFILE_FIELD');

    const logoutRes = await sendRequest(baseUrl, '/api/auth/logout', {
      method: 'POST',
      token,
    });
    assert.equal(logoutRes.status, 200);

    const afterLogoutRes = await sendRequest(baseUrl, '/api/customer/profile', {
      token,
    });
    assert.equal(afterLogoutRes.status, 401);
    assert.equal(afterLogoutRes.body.code, 'TOKEN_REVOKED');
  });

  it('supports cookie-based session restoration and ignores malformed Bearer undefined/null headers', async () => {
    await sendRequest(baseUrl, '/api/auth/customer/register', {
      method: 'POST',
      body: {
        fullName: 'Padma R',
        mobileNumber: '9555666777',
        password: 'CookieSession123',
      },
    });

    const loginRes = await fetch(`${baseUrl}/api/auth/customer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobileNumber: '9555666777',
        password: 'CookieSession123',
      }),
    });
    assert.equal(loginRes.status, 200);

    const setCookie = loginRes.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /rp_access_token=/);
    assert.match(setCookie, /HttpOnly/i);
    const cookiePair = setCookie.split(';')[0];

    // Profile request using only httpOnly cookie (simulating page refresh when token storage is absent)
    const cookieOnlyProfileRes = await fetch(
      `${baseUrl}/api/customer/profile`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Cookie: cookiePair,
        },
      }
    );
    assert.equal(cookieOnlyProfileRes.status, 200);

    // Profile request where Authorization header is "Bearer undefined" but cookie is valid
    const malformedBearerRes = await fetch(`${baseUrl}/api/customer/profile`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer undefined',
        Cookie: cookiePair,
      },
    });
    assert.equal(malformedBearerRes.status, 200);
  });
});
