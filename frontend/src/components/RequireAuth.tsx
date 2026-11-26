import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';

export function RequireAuth() {
  const { user, accessToken, isAuthenticated, isInitializing, isLoading, sessionError, refreshProfile } = useAuth();
  const location = useLocation();

  if (isInitializing || (isLoading && !user)) {
    return (
      <div className="py-12">
        <LoadingState title="Verifying Session..." message="Checking your authentication status with Raithu Palu." />
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
          message={`Your account status is ${user.status}. Access denied. ${user.statusReason ? `Reason: ${user.statusReason}` : 'Please contact support.'}`}
        />
      </div>
    );
  }

  return <Outlet />;
}
