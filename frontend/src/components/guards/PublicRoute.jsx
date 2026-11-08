import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../config/constants';
import { Loader } from '../shared/Loader';

export function PublicRoute({ children }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Loader size="lg" text="Loading..." />
      </div>
    );
  }

  if (isAuthenticated && user) {
    const redirectPath = location.state?.from?.pathname;
    if (redirectPath) {
      return <Navigate to={redirectPath} replace />;
    }

    if (user.role === ROLES.CITIZEN) {
      return <Navigate to="/citizen/requests" replace />;
    }
    if (user.role === ROLES.STAFF) {
      return <Navigate to="/staff/dashboard" replace />;
    }
    if (user.role === ROLES.ADMIN) {
      return <Navigate to="/admin/dashboard" replace />;
    }
  }

  return children;
}
