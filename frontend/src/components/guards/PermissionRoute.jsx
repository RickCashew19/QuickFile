import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Loader } from '../shared/Loader';

export function PermissionRoute({ permission, children }) {
  const { user, hasPermission, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Loader size="lg" text="Checking authorization..." />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasPermission(permission)) {
    return <Navigate to="/staff/dashboard" state={{ unauthorized: true, requiredPermission: permission }} replace />;
  }

  return children;
}
