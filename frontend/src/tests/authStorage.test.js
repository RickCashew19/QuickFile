import { describe, it, expect, beforeEach } from 'vitest';
import { authStorage } from '../services/authStorage';

describe('AuthStorage Service Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    authStorage.clearAll();
  });

  it('stores and retrieves token in memory and localStorage', () => {
    expect(authStorage.getToken()).toBeNull();
    authStorage.setToken('test_access_token_123');
    expect(authStorage.getToken()).toBe('test_access_token_123');
    expect(localStorage.getItem('quickfile_token')).toBe('test_access_token_123');
  });

  it('clears token properly', () => {
    authStorage.setToken('sample_token');
    authStorage.clearToken();
    expect(authStorage.getToken()).toBeNull();
    expect(localStorage.getItem('quickfile_token')).toBeNull();
  });

  it('stores and retrieves user profile object', () => {
    const user = { id: 'u1', email: 'test@example.com', role: 'citizen' };
    authStorage.setUser(user);
    expect(authStorage.getUser()).toEqual(user);
  });

  it('clears all session storage with clearAll', () => {
    authStorage.setToken('token_xyz');
    authStorage.setUser({ id: 'u2' });
    authStorage.clearAll();
    expect(authStorage.getToken()).toBeNull();
    expect(authStorage.getUser()).toBeNull();
  });
});
