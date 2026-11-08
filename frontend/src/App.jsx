import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PublicRoute } from './components/guards/PublicRoute';
import { RoleRoute } from './components/guards/RoleRoute';
import { PermissionRoute } from './components/guards/PermissionRoute';
import { ROLES, STAFF_PERMISSIONS } from './config/constants';

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

// Citizen Portal Pages
import { CitizenDashboardPage } from './pages/citizen/dashboard/CitizenDashboardPage';
import { CitizenCatalogPage } from './pages/citizen/catalog/CitizenCatalogPage';
import { CitizenNewRequestPage } from './pages/citizen/requests/CitizenNewRequestPage';
import { CitizenHistoryPage } from './pages/citizen/requests/CitizenHistoryPage';
import { CitizenRequestDetailPage } from './pages/citizen/requests/CitizenRequestDetailPage';
import { CitizenEditRequestPage } from './pages/citizen/requests/CitizenEditRequestPage';
import { CitizenProfilePage } from './pages/citizen/profile/CitizenProfilePage';
import { CitizenNotificationsPage } from './pages/citizen/notifications/CitizenNotificationsPage';

// Staff Portal Pages
import { StaffDashboardPage } from './pages/staff/dashboard/StaffDashboardPage';
import { StaffQueuePage } from './pages/staff/queue/StaffQueuePage';
import { StaffRequestDetailPage } from './pages/staff/queue/StaffRequestDetailPage';
import { StaffWalkInPage } from './pages/staff/walkin/StaffWalkInPage';
import { CertificatePrintPage } from './pages/staff/print/CertificatePrintPage';
import { StaffRecordsPage } from './pages/staff/records/StaffRecordsPage';
import { StaffVerifyPage } from './pages/staff/verify/StaffVerifyPage';
import { StaffReportsPage } from './pages/staff/reports/StaffReportsPage';

// Admin Portal Pages
import { AdminDashboardPage } from './pages/admin/dashboard/AdminDashboardPage';
import { AdminStaffPage } from './pages/admin/staff/AdminStaffPage';
import { AdminCitizensPage } from './pages/admin/citizens/AdminCitizensPage';
import { AdminDocTypesPage } from './pages/admin/doctypes/AdminDocTypesPage';
import { AdminRecordsPage } from './pages/admin/records/AdminRecordsPage';
import { AdminCertificatesPage } from './pages/admin/certificates/AdminCertificatesPage';
import { AdminAuditLogsPage } from './pages/admin/audit/AdminAuditLogsPage';
import { AdminSettingsPage } from './pages/admin/settings/AdminSettingsPage';
import { AdminReportsPage } from './pages/admin/reports/AdminReportsPage';

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
          <Route path="dashboard" element={<CitizenDashboardPage />} />
          <Route path="catalog" element={<CitizenCatalogPage />} />
          <Route path="requests" element={<CitizenHistoryPage />} />
          <Route path="requests/new" element={<CitizenNewRequestPage />} />
          <Route path="requests/:trackingNumber" element={<CitizenRequestDetailPage />} />
          <Route path="requests/:trackingNumber/edit" element={<CitizenEditRequestPage />} />
          <Route path="profile" element={<CitizenProfilePage />} />
          <Route path="notifications" element={<CitizenNotificationsPage />} />
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
          <Route path="dashboard" element={<StaffDashboardPage />} />
          <Route
            path="requests"
            element={
              <PermissionRoute permission={STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS}>
                <StaffQueuePage />
              </PermissionRoute>
            }
          />
          <Route
            path="requests/walk-in"
            element={
              <PermissionRoute permission={STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS}>
                <StaffWalkInPage />
              </PermissionRoute>
            }
          />
          <Route
            path="requests/:id"
            element={
              <PermissionRoute permission={STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS}>
                <StaffRequestDetailPage />
              </PermissionRoute>
            }
          />
          <Route
            path="requests/:id/print"
            element={
              <PermissionRoute permission={STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS}>
                <CertificatePrintPage />
              </PermissionRoute>
            }
          />
          <Route
            path="records"
            element={
              <PermissionRoute permission={STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS}>
                <StaffRecordsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="verify"
            element={
              <PermissionRoute permission={STAFF_PERMISSIONS.CAN_VERIFY_QR}>
                <StaffVerifyPage />
              </PermissionRoute>
            }
          />
          <Route
            path="reports"
            element={
              <PermissionRoute permission={STAFF_PERMISSIONS.CAN_VIEW_REPORTS}>
                <StaffReportsPage />
              </PermissionRoute>
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
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="staff" element={<AdminStaffPage />} />
          <Route path="citizens" element={<AdminCitizensPage />} />
          <Route path="document-types" element={<AdminDocTypesPage />} />
          <Route path="records" element={<AdminRecordsPage />} />
          <Route path="issued-documents" element={<AdminCertificatesPage />} />
          <Route path="audit-logs" element={<AdminAuditLogsPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="reports" element={<AdminReportsPage />} />
        </Route>

        {/* 404 Catch-All */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}
