import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';

export function ProtectedRoute() {
  const {
    user,
    accessToken,
    isAuthenticated,
    isInitializing,
    isLoading,
    sessionError,
    refreshProfile,
  } = useAuth();
  const location = useLocation();

  // Never redirect while initial session check or active auth transition is in progress
  if (isInitializing || (isLoading && !user)) {
    return (
      <div className="py-12">
        <LoadingState
          title="Verifying Customer Session..."
          message="Checking your authentication status with Raithu Palu."
        />
      </div>
    );
  }

  // If a non-401/403 profile error occurred while a token is present, show retryable error instead of silent logout
  if (!user && accessToken && sessionError) {
    return (
      <div className="py-12">
        <ErrorState
          title="Unable to Load Customer Session"
          message={sessionError}
          onRetry={() => void refreshProfile()}
        />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.role !== 'CUSTOMER') {
    return (
      <div className="py-12">
        <ErrorState
          title="Access Restricted to Customers"
          message="This portal section is restricted to authenticated Customer accounts."
        />
      </div>
    );
  }

  if (user.status !== 'ACTIVE') {
    return (
      <div className="py-12">
        <ErrorState
          title="Customer Account Inactive"
          message={`Your account status is ${user.status}. Please contact Raithu Palu support.`}
        />
      </div>
    );
  }

  return <Outlet />;
}
