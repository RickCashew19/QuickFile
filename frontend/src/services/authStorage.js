/**
 * Secure Token and Session Storage
 * Uses in-memory token caching with localStorage persistence for Capacitor / mobile readiness.
 * Never stores or extracts tokens from URL search parameters.
 */

const TOKEN_KEY = 'quickfile_token';
const USER_KEY = 'quickfile_user';

let inMemoryToken = null;

export const authStorage = {
  getToken() {
    if (inMemoryToken) {
      return inMemoryToken;
    }
    try {
      const stored = localStorage.getItem(TOKEN_KEY);
      inMemoryToken = stored || null;
      return inMemoryToken;
    } catch {
      return inMemoryToken;
    }
  },

  setToken(token) {
    inMemoryToken = token || null;
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      // In private browsing or storage disabled, in-memory token persists
    }
  },

  clearToken() {
    inMemoryToken = null;
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Ignore storage error
    }
  },

  getUser() {
    try {
      const data = localStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  setUser(user) {
    try {
      if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(USER_KEY);
      }
    } catch {
      // Ignore storage error
    }
  },

  clearAll() {
    this.clearToken();
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      // Ignore storage error
    }
  },
};
