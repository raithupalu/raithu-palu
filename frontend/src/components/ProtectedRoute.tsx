import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';

export function ProtectedRoute() {
  const { user, isAuthenticated, isInitializing } = useAuth();
  const location = useLocation();

  if (isInitializing) {
    return (
      <div className="py-12">
        <LoadingState
          title="Verifying Customer Session..."
          message="Checking your authentication status with Raithu Palu."
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

  return <Outlet />;
}
