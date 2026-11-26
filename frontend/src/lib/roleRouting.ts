import type { UserRole } from './authApi';

export const ROLE_DASHBOARD_PATH: Record<UserRole, string> = {
  ADMIN: '/admin',
  CUSTOMER: '/customer/dashboard',
  STAFF: '/staff/dashboard',
  FARMER: '/farmer/dashboard',
  GRAZING_WORKER: '/grazing/dashboard',
};

// All authenticated dashboards — used for guard redirect targets
export const ALL_DASHBOARD_PATHS = Object.values(ROLE_DASHBOARD_PATH);

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Admin',
  CUSTOMER: 'Customer',
  STAFF: 'Staff',
  FARMER: 'Farmer',
  GRAZING_WORKER: 'Grazing Worker',
};

export function getDashboardPathForRole(role: UserRole | string | null | undefined): string {
  if (role && role in ROLE_DASHBOARD_PATH) {
    return ROLE_DASHBOARD_PATH[role as UserRole];
  }
  return '/';
}

export function isDashboardPathForRole(pathname: string, role: UserRole): boolean {
  const expected = ROLE_DASHBOARD_PATH[role];
  // Allow sub-paths: /admin/*, /staff/*, etc.
  if (pathname === expected) return true;
  if (pathname.startsWith(expected + '/')) return true;
  // Legacy aliases that map to customer dashboard
  if (role === 'CUSTOMER') {
    if (
      pathname === '/customer/profile' ||
      pathname === '/dashboard' ||
      pathname === '/profile'
    )
      return true;
  }
  if (role === 'ADMIN') {
    if (pathname === '/admin/accounts') return true;
  }
  return false;
}

export function getAllowedPathsForRole(role: UserRole): string[] {
  const base = ROLE_DASHBOARD_PATH[role];
  switch (role) {
    case 'ADMIN':
      return ['/admin', '/admin/accounts', '/admin/customers', '/admin/*'];
    case 'CUSTOMER':
      return [
        '/customer/dashboard',
        '/customer/profile',
        '/dashboard',
        '/profile',
        base,
      ];
    case 'STAFF':
      return [base, '/staff/*', '/staff/permissions', '/staff/views/*'];
    case 'FARMER':
      return [base, '/farmer/*'];
    case 'GRAZING_WORKER':
      return [base, '/grazing/*', '/grazing/dashboard'];
    default:
      return [base];
  }
}
