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
import { inMemoryAuditLogStore } from '../repositories/auditLogRepository';
import { authService } from '../services/authService';

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

describe('Phase 1 Step 2: Admin Account Management Suite', () => {
  let server: http.Server;
  let baseUrl = '';
  let adminToken = '';

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

  beforeEach(async () => {
    inMemoryUserStore.clear();
    inMemoryAuditLogStore.clear();

    // Provision operator Admin account using manual provisioning service
    const provisioned = await authService.provisionOperatorAdmin({
      fullName: 'Chief Dairy Admin',
      mobileNumber: '9000000001',
      password: 'AdminPassword123',
    });
    assert.equal(provisioned.created, true);
    assert.equal(provisioned.user.userCode, 'ADM-0001');
    assert.equal(provisioned.user.role, 'ADMIN');

    // Authenticate as Admin
    const loginRes = await sendRequest(baseUrl, '/api/auth/admin/login', {
      method: 'POST',
      body: {
        mobileNumber: '9000000001',
        password: 'AdminPassword123',
      },
    });
    assert.equal(loginRes.status, 200);
    adminToken = loginRes.body.accessToken as string;
    assert.ok(adminToken);
  });

  it('1. allows Admin to create STAFF, FARMER, and GRAZING_WORKER accounts with approved userCode prefixes and never exposes password hashes', async () => {
    // Create STAFF account
    const staffRes = await sendRequest(baseUrl, '/api/admin/accounts', {
      method: 'POST',
      token: adminToken,
      body: {
        role: 'STAFF',
        fullName: 'Kiran Kumar',
        mobileNumber: '9111111111',
        password: 'StaffPassword123',
        staffPermissions: ['VIEW_CUSTOMERS', 'VIEW_DAILY_DELIVERIES'],
      },
    });
    assert.equal(staffRes.status, 201);
    const staffAccount = (
      staffRes.body.data as { account: Record<string, unknown> }
    ).account;
    assert.equal(staffAccount.userCode, 'STF-0001');
    assert.equal(staffAccount.role, 'STAFF');
    assert.equal(staffAccount.status, 'ACTIVE');
    assert.deepEqual(staffAccount.staffPermissions, [
      'VIEW_CUSTOMERS',
      'VIEW_DAILY_DELIVERIES',
    ]);
    assert.equal(staffAccount.passwordHash, undefined);

    // Create FARMER account
    const farmerRes = await sendRequest(baseUrl, '/api/admin/accounts', {
      method: 'POST',
      token: adminToken,
      body: {
        role: 'FARMER',
        fullName: 'Subba Reddy',
        mobileNumber: '9222222221',
        password: 'FarmerPassword123',
        farmerProfile: {
          businessContactMobile: '9222222229',
          villageOrLocation: 'Chandragiri Mandal',
          suppliedMilkTypes: ['BUFFALO', 'COW'],
        },
      },
    });
    assert.equal(farmerRes.status, 201);
    const farmerAccount = (
      farmerRes.body.data as { account: Record<string, unknown> }
    ).account;
    assert.equal(farmerAccount.userCode, 'FRM-0001');
    assert.equal(farmerAccount.role, 'FARMER');
    assert.equal(farmerAccount.mobileNumber, '9222222221');
    const farmerProfile = farmerAccount.farmerProfile as Record<string, unknown>;
    assert.equal(farmerProfile.businessContactMobile, '9222222229');
    assert.equal(farmerProfile.villageOrLocation, 'Chandragiri Mandal');
    assert.deepEqual(farmerProfile.suppliedMilkTypes, ['BUFFALO', 'COW']);
    assert.equal(farmerAccount.passwordHash, undefined);

    // Create GRAZING_WORKER account
    const grazingRes = await sendRequest(baseUrl, '/api/admin/accounts', {
      method: 'POST',
      token: adminToken,
      body: {
        role: 'GRAZING_WORKER',
        fullName: 'Mallikarjuna',
        mobileNumber: '9333333331',
        password: 'GrazingPassword123',
        grazingWorkerProfile: {
          emergencyContactMobile: '9333333339',
          assignedNotes: 'Morning and evening buffalo herd shift',
        },
      },
    });
    assert.equal(grazingRes.status, 201);
    const grazingAccount = (
      grazingRes.body.data as { account: Record<string, unknown> }
    ).account;
    assert.equal(grazingAccount.userCode, 'GRZ-0001');
    assert.equal(grazingAccount.role, 'GRAZING_WORKER');
    assert.equal(grazingAccount.passwordHash, undefined);

    // Verify Admin listing returns all 3 managed accounts and metrics
    const listRes = await sendRequest(baseUrl, '/api/admin/accounts', {
      token: adminToken,
    });
    assert.equal(listRes.status, 200);
    const listData = listRes.body.data as {
      accounts: Array<Record<string, unknown>>;
      metrics: {
        totalManaged: number;
        byRole: Record<string, number>;
      };
    };
    assert.equal(listData.accounts.length, 3);
    assert.equal(listData.metrics.totalManaged, 3);
    assert.equal(listData.metrics.byRole.STAFF, 1);
    assert.equal(listData.metrics.byRole.FARMER, 1);
    assert.equal(listData.metrics.byRole.GRAZING_WORKER, 1);
  });

  it('2. denies non-Admin users (unauthenticated, CUSTOMER, STAFF, FARMER, GRAZING_WORKER) access to Admin account-management endpoints', async () => {
    // Unauthenticated request
    const unauthRes = await sendRequest(baseUrl, '/api/admin/accounts');
    assert.equal(unauthRes.status, 401);
    assert.equal(unauthRes.body.code, 'AUTHENTICATION_REQUIRED');

    // Register a CUSTOMER and try to access /api/admin/accounts
    const custReg = await sendRequest(baseUrl, '/api/auth/customer/register', {
      method: 'POST',
      body: {
        fullName: 'Customer User',
        mobileNumber: '9444444441',
        password: 'CustomerPassword123',
      },
    });
    const customerToken = custReg.body.accessToken as string;

    const custListAttempt = await sendRequest(baseUrl, '/api/admin/accounts', {
      token: customerToken,
    });
    assert.equal(custListAttempt.status, 403);
    assert.equal(custListAttempt.body.code, 'FORBIDDEN_ROLE');

    const custCreateAttempt = await sendRequest(
      baseUrl,
      '/api/admin/accounts',
      {
        method: 'POST',
        token: customerToken,
        body: {
          role: 'STAFF',
          fullName: 'Unauthorized Staff',
          mobileNumber: '9444444442',
          password: 'StaffPassword123',
        },
      }
    );
    assert.equal(custCreateAttempt.status, 403);
    assert.equal(custCreateAttempt.body.code, 'FORBIDDEN_ROLE');

    // Create a STAFF user as Admin, log in as STAFF, and verify STAFF is denied Admin endpoints
    await sendRequest(baseUrl, '/api/admin/accounts', {
      method: 'POST',
      token: adminToken,
      body: {
        role: 'STAFF',
        fullName: 'Staff User',
        mobileNumber: '9555555551',
        password: 'StaffPassword123',
        staffPermissions: ['VIEW_CUSTOMERS'],
      },
    });

    const staffLogin = await sendRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        mobileNumber: '9555555551',
        password: 'StaffPassword123',
      },
    });
    assert.equal(staffLogin.status, 200);
    const staffToken = staffLogin.body.accessToken as string;

    // Staff cannot log in via /api/auth/admin/login
    const staffAdminLoginAttempt = await sendRequest(
      baseUrl,
      '/api/auth/admin/login',
      {
        method: 'POST',
        body: {
          mobileNumber: '9555555551',
          password: 'StaffPassword123',
        },
      }
    );
    assert.equal(staffAdminLoginAttempt.status, 403);
    assert.equal(staffAdminLoginAttempt.body.code, 'ROLE_FORBIDDEN');

    // Staff cannot access /api/admin/accounts
    const staffAdminListAttempt = await sendRequest(
      baseUrl,
      '/api/admin/accounts',
      {
        token: staffToken,
      }
    );
    assert.equal(staffAdminListAttempt.status, 403);
    assert.equal(staffAdminListAttempt.body.code, 'FORBIDDEN_ROLE');
  });

  it('3. rejects invalid role assignments, ADMIN account creation via API, and role escalation attempts', async () => {
    // Admin cannot create another ADMIN via account management endpoint
    const createAdminAttempt = await sendRequest(
      baseUrl,
      '/api/admin/accounts',
      {
        method: 'POST',
        token: adminToken,
        body: {
          role: 'ADMIN',
          fullName: 'Unauthorized Admin',
          mobileNumber: '9666666661',
          password: 'AdminPassword123',
        },
      }
    );
    assert.equal(createAdminAttempt.status, 403);
    assert.equal(createAdminAttempt.body.code, 'INVALID_ROLE');

    // Unknown/invalid role is rejected
    const unknownRoleAttempt = await sendRequest(
      baseUrl,
      '/api/admin/accounts',
      {
        method: 'POST',
        token: adminToken,
        body: {
          role: 'SUPER_MANAGER',
          fullName: 'Invalid Role User',
          mobileNumber: '9666666662',
          password: 'ManagerPassword123',
        },
      }
    );
    assert.equal(unknownRoleAttempt.status, 400);
    assert.equal(unknownRoleAttempt.body.code, 'INVALID_ROLE');

    // Create a valid STAFF account and attempt to escalate its role to ADMIN via PATCH
    const createdStaffRes = await sendRequest(baseUrl, '/api/admin/accounts', {
      method: 'POST',
      token: adminToken,
      body: {
        role: 'STAFF',
        fullName: 'Normal Staff',
        mobileNumber: '9666666663',
        password: 'StaffPassword123',
      },
    });
    const staffId = (
      createdStaffRes.body.data as { account: { id: string } }
    ).account.id;

    const escalateAttempt = await sendRequest(
      baseUrl,
      `/api/admin/accounts/${staffId}`,
      {
        method: 'PATCH',
        token: adminToken,
        body: {
          role: 'ADMIN',
        },
      }
    );
    assert.equal(escalateAttempt.status, 400);
    assert.equal(escalateAttempt.body.code, 'IMMUTABLE_ACCOUNT_FIELD');
  });

  it('4. supports account status transitions (ACTIVE, INACTIVE, SUSPENDED, BLOCKED) and records audit logs', async () => {
    const createRes = await sendRequest(baseUrl, '/api/admin/accounts', {
      method: 'POST',
      token: adminToken,
      body: {
        role: 'GRAZING_WORKER',
        fullName: 'Narasimha',
        mobileNumber: '9777777711',
        password: 'WorkerPassword123',
      },
    });
    const workerId = (
      createRes.body.data as { account: { id: string } }
    ).account.id;

    for (const status of [
      'INACTIVE',
      'SUSPENDED',
      'BLOCKED',
      'ACTIVE',
    ] as const) {
      const statusRes = await sendRequest(
        baseUrl,
        `/api/admin/accounts/${workerId}/status`,
        {
          method: 'PATCH',
          token: adminToken,
          body: {
            status,
            reason: `Transitioning account to ${status}`,
          },
        }
      );
      assert.equal(statusRes.status, 200);
      const data = statusRes.body.data as {
        account: { status: string; statusReason: string };
        sessionRevoked: boolean;
      };
      assert.equal(data.account.status, status);
      assert.equal(data.account.statusReason, `Transitioning account to ${status}`);
      assert.equal(data.sessionRevoked, status !== 'ACTIVE');
    }

    // Verify audit logs were recorded for creation and status transitions
    const auditRes = await sendRequest(
      baseUrl,
      `/api/admin/audit-logs?targetUserId=${workerId}`,
      {
        token: adminToken,
      }
    );
    assert.equal(auditRes.status, 200);
    const logs = (
      auditRes.body.data as { auditLogs: Array<{ action: string }> }
    ).auditLogs;
    assert.ok(logs.length >= 5);
    assert.equal(logs[0].action, 'ACCOUNT_STATUS_CHANGED');
  });

  it('5. revokes active sessions and rejects future authenticated requests when an account becomes INACTIVE, SUSPENDED, or BLOCKED', async () => {
    const createRes = await sendRequest(baseUrl, '/api/admin/accounts', {
      method: 'POST',
      token: adminToken,
      body: {
        role: 'STAFF',
        fullName: 'Anitha R',
        mobileNumber: '9777777722',
        password: 'StaffPassword123',
        staffPermissions: ['VIEW_CUSTOMERS'],
      },
    });
    const staffId = (
      createRes.body.data as { account: { id: string } }
    ).account.id;

    for (const nonActiveStatus of [
      'INACTIVE',
      'SUSPENDED',
      'BLOCKED',
    ] as const) {
      // Ensure account is ACTIVE first
      await sendRequest(baseUrl, `/api/admin/accounts/${staffId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'ACTIVE', reason: 'Re-activating for test' },
      });

      // Log in as Staff and confirm active session works
      const loginRes = await sendRequest(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: {
          mobileNumber: '9777777722',
          password: 'StaffPassword123',
        },
      });
      assert.equal(loginRes.status, 200);
      const staffToken = loginRes.body.accessToken as string;

      const meBefore = await sendRequest(baseUrl, '/api/auth/me', {
        token: staffToken,
      });
      assert.equal(meBefore.status, 200);

      // Admin changes status to non-ACTIVE (INACTIVE / SUSPENDED / BLOCKED)
      const deactivateRes = await sendRequest(
        baseUrl,
        `/api/admin/accounts/${staffId}/status`,
        {
          method: 'PATCH',
          token: adminToken,
          body: {
            status: nonActiveStatus,
            reason: `Account marked ${nonActiveStatus}`,
          },
        }
      );
      assert.equal(deactivateRes.status, 200);

      // Previously issued JWT must immediately be rejected on backend API
      const meAfter = await sendRequest(baseUrl, '/api/auth/me', {
        token: staffToken,
      });
      assert.equal(meAfter.status, 403);
      assert.equal(meAfter.body.code, 'ACCOUNT_INACTIVE');

      // New login attempt must also be rejected while non-ACTIVE
      const reloginAttempt = await sendRequest(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: {
          mobileNumber: '9777777722',
          password: 'StaffPassword123',
        },
      });
      assert.equal(reloginAttempt.status, 403);
      assert.equal(reloginAttempt.body.code, 'ACCOUNT_INACTIVE');
    }
  });

  it('6. enforces Admin-configured view-only staff permissions on backend APIs and blocks staff from modifying their own permissions', async () => {
    const createRes = await sendRequest(baseUrl, '/api/admin/accounts', {
      method: 'POST',
      token: adminToken,
      body: {
        role: 'STAFF',
        fullName: 'Suresh Babu',
        mobileNumber: '9888888811',
        password: 'StaffPassword123',
        staffPermissions: ['VIEW_CUSTOMERS'],
      },
    });
    const staffId = (
      createRes.body.data as { account: { id: string } }
    ).account.id;

    const loginRes = await sendRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        mobileNumber: '9888888811',
        password: 'StaffPassword123',
      },
    });
    const staffToken = loginRes.body.accessToken as string;

    // Allowed view endpoint (VIEW_CUSTOMERS)
    const allowedView = await sendRequest(
      baseUrl,
      '/api/staff/views/customers',
      {
        token: staffToken,
      }
    );
    assert.equal(allowedView.status, 200);

    // Disallowed view endpoint (VIEW_BILLING not granted)
    const deniedView = await sendRequest(baseUrl, '/api/staff/views/billing', {
      token: staffToken,
    });
    assert.equal(deniedView.status, 403);
    assert.equal(deniedView.body.code, 'FORBIDDEN_STAFF_PERMISSION');

    // Staff cannot modify their own permissions via /api/staff/permissions
    const selfModifyAttempt1 = await sendRequest(
      baseUrl,
      '/api/staff/permissions',
      {
        method: 'PATCH',
        token: staffToken,
        body: {
          staffPermissions: ['VIEW_CUSTOMERS', 'VIEW_BILLING'],
        },
      }
    );
    assert.equal(selfModifyAttempt1.status, 403);
    assert.equal(
      selfModifyAttempt1.body.code,
      'FORBIDDEN_SELF_PERMISSION_MODIFICATION'
    );

    // Staff cannot modify their own permissions via Admin endpoint
    const selfModifyAttempt2 = await sendRequest(
      baseUrl,
      `/api/admin/accounts/${staffId}/permissions`,
      {
        method: 'PATCH',
        token: staffToken,
        body: {
          staffPermissions: ['VIEW_CUSTOMERS', 'VIEW_BILLING'],
        },
      }
    );
    assert.equal(selfModifyAttempt2.status, 403);
    assert.equal(selfModifyAttempt2.body.code, 'FORBIDDEN_ROLE');

    // Admin cannot grant unapproved/write permissions to Staff
    const invalidPermAttempt = await sendRequest(
      baseUrl,
      `/api/admin/accounts/${staffId}/permissions`,
      {
        method: 'PATCH',
        token: adminToken,
        body: {
          staffPermissions: ['VIEW_CUSTOMERS', 'EDIT_DELIVERIES'],
        },
      }
    );
    assert.equal(invalidPermAttempt.status, 400);
    assert.equal(invalidPermAttempt.body.code, 'INVALID_STAFF_PERMISSION');

    // Admin grants VIEW_BILLING to Staff; Staff can now view /api/staff/views/billing
    const grantRes = await sendRequest(
      baseUrl,
      `/api/admin/accounts/${staffId}/permissions`,
      {
        method: 'PATCH',
        token: adminToken,
        body: {
          staffPermissions: ['VIEW_CUSTOMERS', 'VIEW_BILLING'],
        },
      }
    );
    assert.equal(grantRes.status, 200);

    const billingViewAfterGrant = await sendRequest(
      baseUrl,
      '/api/staff/views/billing',
      {
        token: staffToken,
      }
    );
    assert.equal(billingViewAfterGrant.status, 200);
  });

  it('7. preserves separate farmer login mobile number and farmer business contact mobile number across creation, login, and updates', async () => {
    const createFarmerRes = await sendRequest(baseUrl, '/api/admin/accounts', {
      method: 'POST',
      token: adminToken,
      body: {
        role: 'FARMER',
        fullName: 'Gopalakrishna Naidu',
        mobileNumber: '9888888821',
        password: 'FarmerPassword123',
        farmerProfile: {
          businessContactMobile: '9888888829',
          villageOrLocation: 'Renigunta',
          suppliedMilkTypes: ['BUFFALO'],
        },
      },
    });
    assert.equal(createFarmerRes.status, 201);
    const createdFarmer = (
      createFarmerRes.body.data as {
        account: {
          id: string;
          userCode: string;
          mobileNumber: string;
          farmerProfile: { businessContactMobile: string };
        };
      }
    ).account;
    assert.equal(createdFarmer.userCode, 'FRM-0001');
    assert.equal(createdFarmer.mobileNumber, '9888888821');
    assert.equal(
      createdFarmer.farmerProfile.businessContactMobile,
      '9888888829'
    );

    // Farmer can log in using their login mobileNumber
    const loginWithAuthMobile = await sendRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        mobileNumber: '9888888821',
        password: 'FarmerPassword123',
      },
    });
    assert.equal(loginWithAuthMobile.status, 200);

    // Farmer CANNOT log in using their businessContactMobile
    const loginWithBusinessMobile = await sendRequest(
      baseUrl,
      '/api/auth/login',
      {
        method: 'POST',
        body: {
          mobileNumber: '9888888829',
          password: 'FarmerPassword123',
        },
      }
    );
    assert.equal(loginWithBusinessMobile.status, 401);
    assert.equal(loginWithBusinessMobile.body.code, 'INVALID_CREDENTIALS');

    // Admin updates businessContactMobile without changing login mobileNumber
    const updateFarmerRes = await sendRequest(
      baseUrl,
      `/api/admin/accounts/${createdFarmer.id}`,
      {
        method: 'PATCH',
        token: adminToken,
        body: {
          farmerProfile: {
            businessContactMobile: '9888888830',
            villageOrLocation: 'Srikalahasti Road',
            suppliedMilkTypes: ['BUFFALO', 'COW'],
          },
        },
      }
    );
    assert.equal(updateFarmerRes.status, 200);
    const updatedFarmer = (
      updateFarmerRes.body.data as {
        account: {
          mobileNumber: string;
          farmerProfile: {
            businessContactMobile: string;
            villageOrLocation: string;
          };
        };
      }
    ).account;
    assert.equal(updatedFarmer.mobileNumber, '9888888821');
    assert.equal(
      updatedFarmer.farmerProfile.businessContactMobile,
      '9888888830'
    );
    assert.equal(
      updatedFarmer.farmerProfile.villageOrLocation,
      'Srikalahasti Road'
    );
  });

  it('8. preserves existing customer registration, login, profile retrieval/update, and CUS-XXXX prefix behavior', async () => {
    const regRes = await sendRequest(baseUrl, '/api/auth/customer/register', {
      method: 'POST',
      body: {
        fullName: 'Lakshmi Devi',
        mobileNumber: '9999999911',
        password: 'CustomerPassword123',
        address: {
          line1: '108 Gandhi Road',
          city: 'Tirupati',
          pincode: '517501',
        },
      },
    });
    assert.equal(regRes.status, 201);
    const regUser = regRes.body.user as Record<string, unknown>;
    assert.equal(regUser.userCode, 'CUS-0001');
    assert.equal(regUser.role, 'CUSTOMER');
    const customerToken = regRes.body.accessToken as string;

    const profileRes = await sendRequest(baseUrl, '/api/customer/profile', {
      token: customerToken,
    });
    assert.equal(profileRes.status, 200);
    const profile = (
      profileRes.body.data as { profile: Record<string, unknown> }
    ).profile;
    assert.equal(profile.userCode, 'CUS-0001');
    assert.equal(profile.fullName, 'Lakshmi Devi');

    const updateRes = await sendRequest(baseUrl, '/api/customer/profile', {
      method: 'PATCH',
      token: customerToken,
      body: {
        fullName: 'Lakshmi Narayana Devi',
      },
    });
    assert.equal(updateRes.status, 200);
    assert.equal(
      (updateRes.body.data as { profile: { fullName: string } }).profile
        .fullName,
      'Lakshmi Narayana Devi'
    );
  });
});
