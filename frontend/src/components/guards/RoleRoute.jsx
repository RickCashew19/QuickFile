import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Loader } from '../shared/Loader';
import { ROLES } from '../../config/constants';

export function RoleRoute({ allowedRoles, children }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Loader size="lg" text="Verifying permissions..." />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    // Redirect to the appropriate portal for the user's role
    if (user.role === ROLES.CITIZEN) {
      return <Navigate to="/citizen/requests" replace />;
    }
    if (user.role === ROLES.STAFF) {
      return <Navigate to="/staff/dashboard" replace />;
    }
    if (user.role === ROLES.ADMIN) {
      return <Navigate to="/admin/dashboard" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return children;
}
