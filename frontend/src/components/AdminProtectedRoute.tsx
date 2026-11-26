import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';

export function AdminProtectedRoute() {
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

  if (isInitializing || (isLoading && !user)) {
    return (
      <div className="py-12">
        <LoadingState
          title="Verifying Admin Session..."
          message="Checking your administrator credentials with Raithu Palu."
        />
      </div>
    );
  }

  if (!user && accessToken && sessionError) {
    return (
      <div className="py-12">
        <ErrorState
          title="Unable to Load Admin Session"
          message={sessionError}
          onRetry={() => void refreshProfile()}
        />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  if (user.role !== 'ADMIN') {
    return (
      <div className="py-12">
        <ErrorState
          title="Administrator Access Required"
          message="This account management console is restricted to authorized Admin accounts."
        />
      </div>
    );
  }

  if (user.status !== 'ACTIVE') {
    return (
      <div className="py-12">
        <ErrorState
          title="Admin Account Inactive"
          message={`Your account status is ${user.status}. Access denied.`}
        />
      </div>
    );
  }

  return <Outlet />;
}
