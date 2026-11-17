/**
 * In-memory access-token cache.
 *
 * Browser sessions are carried by an httpOnly cookie issued by the API, so the
 * JWT is deliberately NOT written to localStorage (XSS token theft). The
 * in-memory value is kept only so non-browser clients and tests can still use
 * the Bearer-header path.
 */

const USER_KEY = 'quickfile_user';

let inMemoryToken = null;

export const authStorage = {
  getToken() {
    return inMemoryToken;
  },

  setToken(token) {
    inMemoryToken = token || null;
  },

  clearToken() {
    inMemoryToken = null;
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
