import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </ToastProvider>
    </AuthProvider>
  );
}
