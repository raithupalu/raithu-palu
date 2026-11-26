import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from './LoadingState';
import { getDashboardPathForRole } from '../lib/roleRouting';

export function RoleRedirect() {
  const { user, isAuthenticated, isInitializing } = useAuth();

  if (isInitializing) {
    return (
      <div className="py-12">
        <LoadingState title="Checking Session..." message="Determining your dashboard." />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const target = getDashboardPathForRole(user.role);
  return <Navigate to={target} replace />;
}
