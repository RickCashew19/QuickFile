import { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import { authStorage } from '../services/authStorage';
import { authService } from '../services/authService';
import { ROLES } from '../config/constants';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authStorage.getUser());
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null);

  // Hydrate user session on initial application load
  const refreshUser = useCallback(async () => {
    const token = authStorage.getToken();
    if (!token) {
      setUser(null);
      setProfile(null);
      setPermissions(null);
      setIsLoading(false);
      return;
    }

    try {
      const data = await authService.getMe();
      if (data && data.user) {
        setUser(data.user);
        setProfile(data.profile || null);
        setPermissions(data.permissions || null);
        authStorage.setUser(data.user);
      } else {
        authStorage.clearAll();
        setUser(null);
      }
    } catch {
      authStorage.clearAll();
      setUser(null);
      setProfile(null);
      setPermissions(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();

    // Listen for automatic logout events triggered by apiClient
    const handleAuthExpired = (event) => {
      setUser(null);
      setProfile(null);
      setPermissions(null);
      setSessionExpiredMessage(event.detail?.message || 'Your session has expired. Please log in again.');
    };

    window.addEventListener('quickfile:auth:expired', handleAuthExpired);
    return () => {
      window.removeEventListener('quickfile:auth:expired', handleAuthExpired);
    };
  }, [refreshUser]);

  const login = useCallback(async (email, password, recaptchaToken = null) => {
    const result = await authService.login(email, password, recaptchaToken);
    authStorage.setToken(result.access_token);
    authStorage.setUser(result.user);
    setUser(result.user);
    setProfile(result.profile || null);
    setPermissions(result.permissions || null);
    setSessionExpiredMessage(null);
    return result;
  }, []);

  const loginWithGoogle = useCallback(async (idToken) => {
    const result = await authService.loginWithGoogle(idToken);
    authStorage.setToken(result.access_token);
    authStorage.setUser(result.user);
    setUser(result.user);
    setProfile(result.profile || null);
    setPermissions(result.permissions || null);
    setSessionExpiredMessage(null);
    return result;
  }, []);

  const register = useCallback(async (registrationData) => {
    const result = await authService.register(registrationData);
    authStorage.setToken(result.access_token);
    authStorage.setUser(result.user);
    setUser(result.user);
    setProfile(result.profile || null);
    setPermissions(null);
    setSessionExpiredMessage(null);
    return result;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    authStorage.clearAll();
    setUser(null);
    setProfile(null);
    setPermissions(null);
  }, []);

  const clearExpiredMessage = useCallback(() => {
    setSessionExpiredMessage(null);
  }, []);

  /**
   * Evaluates if user possesses a specific staff permission.
   * Admins implicitly hold all permissions.
   */
  const hasPermission = useCallback(
    (permissionKey) => {
      if (!user) return false;
      if (user.role === ROLES.ADMIN) return true;
      if (user.role === ROLES.STAFF && permissions) {
        return Boolean(permissions[permissionKey]);
      }
      return false;
    },
    [user, permissions]
  );

  const value = useMemo(
    () => ({
      user,
      profile,
      permissions,
      isAuthenticated: Boolean(user),
      isLoading,
      sessionExpiredMessage,
      clearExpiredMessage,
      login,
      loginWithGoogle,
      register,
      logout,
      refreshUser,
      hasPermission,
    }),
    [
      user,
      profile,
      permissions,
      isLoading,
      sessionExpiredMessage,
      clearExpiredMessage,
      login,
      loginWithGoogle,
      register,
      logout,
      refreshUser,
      hasPermission,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
