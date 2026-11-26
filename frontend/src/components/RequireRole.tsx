import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';
import { getDashboardPathForRole } from '../lib/roleRouting';
import type { UserRole } from '../lib/authApi';

interface RequireRoleProps {
  roles: UserRole[];
  fallbackRedirect?: boolean; // if true, redirect to correct dashboard instead of error
}

export function RequireRole({ roles, fallbackRedirect = true }: RequireRoleProps) {
  const { user, accessToken, isAuthenticated, isInitializing, isLoading, sessionError, refreshProfile } = useAuth();
  const location = useLocation();

  if (isInitializing || (isLoading && !user)) {
    return (
      <div className="py-12">
        <LoadingState
          title="Verifying Session..."
          message="Checking your authentication status with Raithu Palu."
        />
      </div>
    );
  }

  if (!user && accessToken && sessionError) {
    return (
      <div className="py-12">
        <ErrorState title="Unable to Load Session" message={sessionError} onRetry={() => void refreshProfile()} />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.status !== 'ACTIVE') {
    return (
      <div className="py-12">
        <ErrorState
          title="Account Inactive"
          message={`Your account status is ${user.status}. Access denied.`}
        />
      </div>
    );
  }

  if (!roles.includes(user.role as UserRole)) {
    if (fallbackRedirect) {
      const correctPath = getDashboardPathForRole(user.role);
      return <Navigate to={correctPath} replace />;
    }
    return (
      <div className="py-12">
        <ErrorState
          title="Access Restricted"
          message={`This area is restricted to ${roles.join(', ')} accounts. Your role is ${user.role}.`}
        />
      </div>
    );
  }

  return <Outlet />;
}

// Convenience wrappers for each role
export function RequireAdmin() {
  return <RequireRole roles={['ADMIN']} />;
}
export function RequireCustomer() {
  return <RequireRole roles={['CUSTOMER']} />;
}
export function RequireStaff() {
  return <RequireRole roles={['STAFF']} />;
}
export function RequireFarmer() {
  return <RequireRole roles={['FARMER']} />;
}
export function RequireGrazingWorker() {
  return <RequireRole roles={['GRAZING_WORKER']} />;
}
