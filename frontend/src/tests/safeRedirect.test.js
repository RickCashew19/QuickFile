import { describe, it, expect } from 'vitest';
import { getSafeRedirect } from '../utils/urlHelper';

describe('getSafeRedirect Security Suite', () => {
  it('rejects protocol-relative URLs starting with //', () => {
    expect(getSafeRedirect('//example.com')).toBeNull();
    expect(getSafeRedirect('///evil.com/path')).toBeNull();
  });

  it('rejects external URLs with schemes', () => {
    expect(getSafeRedirect('https://evil.com')).toBeNull();
    expect(getSafeRedirect('http://evil.com/citizen')).toBeNull();
    expect(getSafeRedirect('ftp://evil.com')).toBeNull();
  });

  it('rejects backslash bypasses (/\\ and \\)', () => {
    expect(getSafeRedirect('/\\evil.com')).toBeNull();
    expect(getSafeRedirect('/\\/evil.com')).toBeNull();
    expect(getSafeRedirect('/citizen\\evil')).toBeNull();
    expect(getSafeRedirect('\\\\evil.com')).toBeNull();
  });

  it('rejects javascript: and other dangerous pseudo-schemes', () => {
    expect(getSafeRedirect('javascript:alert(1)')).toBeNull();
    expect(getSafeRedirect('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(getSafeRedirect('vbscript:msgbox(1)')).toBeNull();
  });

  it('rejects URL-encoded bypass attempts', () => {
    expect(getSafeRedirect('/%2fexample.com')).toBeNull();
    expect(getSafeRedirect('%2f%2fexample.com')).toBeNull();
    expect(getSafeRedirect('/%5cexample.com')).toBeNull();
    expect(getSafeRedirect('/citizen/%2e%2e/admin')).toBeNull();
  });

  it('rejects control characters and malformed paths', () => {
    expect(getSafeRedirect('/citizen\r\nHeader-Injection')).toBeNull();
    expect(getSafeRedirect('/citizen\0evil')).toBeNull();
    expect(getSafeRedirect('/citizen%E0%A4%A')).toBeNull(); // Malformed UTF-8
  });

  it('rejects paths not matching known portal prefixes', () => {
    expect(getSafeRedirect('/unauthorized-path')).toBeNull();
    expect(getSafeRedirect('/dashboard')).toBeNull();
    expect(getSafeRedirect('/citizen-fake')).toBeNull();
  });

  it('allows valid internal portal paths and preserves query strings and hashes', () => {
    expect(getSafeRedirect('/citizen/dashboard')).toBe('/citizen/dashboard');
    expect(getSafeRedirect('/citizen/requests/new?doc=BC-001&copies=2')).toBe(
      '/citizen/requests/new?doc=BC-001&copies=2'
    );
    expect(getSafeRedirect('/staff/dashboard')).toBe('/staff/dashboard');
    expect(getSafeRedirect('/admin/settings?tab=general#security')).toBe(
      '/admin/settings?tab=general#security'
    );
    expect(getSafeRedirect('/verify/CERT-2026-0001')).toBe('/verify/CERT-2026-0001');
  });

  it('supports React Router location objects and retains search query parameters', () => {
    const locationObj = {
      pathname: '/citizen/requests',
      search: '?status=pending&page=2',
      hash: '#table',
    };
    expect(getSafeRedirect(locationObj)).toBe('/citizen/requests?status=pending&page=2#table');
  });

  it('returns custom fallback when specified and validation fails', () => {
    expect(getSafeRedirect('https://evil.com', '/citizen/dashboard')).toBe('/citizen/dashboard');
    expect(getSafeRedirect(null, '/default')).toBe('/default');
  });
});
