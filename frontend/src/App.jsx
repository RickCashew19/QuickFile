import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PublicRoute } from './components/guards/PublicRoute';
import { RoleRoute } from './components/guards/RoleRoute';
import { ROLES } from './config/constants';

// Layout Shells
import { PublicLayout } from './components/layout/PublicLayout';
import { CitizenLayout } from './components/layout/CitizenLayout';
import { StaffLayout } from './components/layout/StaffLayout';
import { AdminLayout } from './components/layout/AdminLayout';

// Public Pages
import { LandingPage } from './pages/public/LandingPage';
import { LoginPage } from './pages/public/LoginPage';
import { RegisterPage } from './pages/public/RegisterPage';
import { ForgotPasswordPage } from './pages/public/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/public/ResetPasswordPage';
import { PublicVerifyPage } from './pages/public/PublicVerifyPage';
import { NotFoundPage } from './pages/public/NotFoundPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public Routes with Shared Header, Skip Link, and Drawer */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/verify/:code?" element={<PublicVerifyPage />} />
        </Route>

        {/* Standalone Authentication Views */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <RegisterPage />
            </PublicRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicRoute>
              <ForgotPasswordPage />
            </PublicRoute>
          }
        />
        <Route
          path="/reset-password"
          element={
            <PublicRoute>
              <ResetPasswordPage />
            </PublicRoute>
          }
        />

        {/* Citizen Portal Shell */}
        <Route
          path="/citizen"
          element={
            <RoleRoute allowedRoles={[ROLES.CITIZEN]}>
              <CitizenLayout />
            </RoleRoute>
          }
        >
          <Route index element={<Navigate to="/citizen/dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <div style={{ padding: 'var(--space-6)' }}>
                <h2>Citizen Dashboard</h2>
                <p>Citizen portal modules are being loaded.</p>
              </div>
            }
          />
          <Route
            path="requests"
            element={
              <div style={{ padding: 'var(--space-6)' }}>
                <h2>Request History</h2>
              </div>
            }
          />
        </Route>

        {/* Staff Portal Shell */}
        <Route
          path="/staff"
          element={
            <RoleRoute allowedRoles={[ROLES.STAFF, ROLES.ADMIN]}>
              <StaffLayout />
            </RoleRoute>
          }
        >
          <Route index element={<Navigate to="/staff/dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <div style={{ padding: 'var(--space-6)' }}>
                <h2>Staff Workspace</h2>
                <p>Staff document queues and walk-in modules are active in Phase F3.</p>
              </div>
            }
          />
        </Route>

        {/* Admin Portal Shell */}
        <Route
          path="/admin"
          element={
            <RoleRoute allowedRoles={[ROLES.ADMIN]}>
              <AdminLayout />
            </RoleRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <div style={{ padding: 'var(--space-6)' }}>
                <h2>System Administration</h2>
                <p>Executive dashboards, settings, and staff accounts management will be active in Phase F4.</p>
              </div>
            }
          />
        </Route>

        {/* 404 Catch-All */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}
