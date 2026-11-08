import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PublicRoute } from './components/guards/PublicRoute';
import { RoleRoute } from './components/guards/RoleRoute';
import { ROLES } from './config/constants';

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
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
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
        <Route path="/verify/:code?" element={<PublicVerifyPage />} />

        {/* Protected Portals (Shells for subsequent phases F2, F3, F4) */}
        <Route
          path="/citizen/*"
          element={
            <RoleRoute allowedRoles={[ROLES.CITIZEN]}>
              <div style={{ padding: 'var(--space-6)' }}>
                <h2>Citizen Portal</h2>
                <p>Citizen portal modules will be loaded in Phase F2.</p>
              </div>
            </RoleRoute>
          }
        />

        <Route
          path="/staff/*"
          element={
            <RoleRoute allowedRoles={[ROLES.STAFF, ROLES.ADMIN]}>
              <div style={{ padding: 'var(--space-6)' }}>
                <h2>Staff Portal</h2>
                <p>Staff processing workspace will be loaded in Phase F3.</p>
              </div>
            </RoleRoute>
          }
        />

        <Route
          path="/admin/*"
          element={
            <RoleRoute allowedRoles={[ROLES.ADMIN]}>
              <div style={{ padding: 'var(--space-6)' }}>
                <h2>Admin Portal</h2>
                <p>System administration workspace will be loaded in Phase F4.</p>
              </div>
            </RoleRoute>
          }
        />

        {/* 404 Catch-All */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}
