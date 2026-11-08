import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Production CSP Plugin
 * Injects a strict Content-Security-Policy meta tag during production build only (transformIndexHtml).
 * In development mode, no CSP is injected so Vite HMR and local tooling operate cleanly with zero console warnings.
 * Dynamically resolves connect-src origin from VITE_API_URL.
 */
function productionCspPlugin(mode) {
  if (mode !== 'production') {
    return null;
  }

  return {
    name: 'vite-plugin-production-csp',
    transformIndexHtml(html) {
      const env = loadEnv(mode, process.cwd(), '');
      const apiUrl = env.VITE_API_URL || 'http://localhost:5000/api/v1';

      let apiOrigin = 'http://localhost:5000';
      if (apiUrl.startsWith('http')) {
        try {
          apiOrigin = new URL(apiUrl).origin;
        } catch {
          apiOrigin = 'http://localhost:5000';
        }
      } else {
        apiOrigin = "'self'";
      }

      const cspDirectives = [
        "default-src 'self'",
        "script-src 'self' https://accounts.google.com/gsi/client https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https://*.googleusercontent.com https://www.gstatic.com",
        "media-src 'self' blob:",
        "frame-src 'self' https://accounts.google.com/gsi/ https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
        `connect-src 'self' ${apiOrigin === "'self'" ? '' : apiOrigin} https://accounts.google.com/gsi/`.replace(/\s+/g, ' ').trim(),
      ];

      const metaTag = `    <meta http-equiv="Content-Security-Policy" content="${cspDirectives.join('; ')};" />`;
      return html.replace('</head>', `${metaTag}\n  </head>`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), productionCspPlugin(mode)].filter(Boolean),
  server: {
    port: 5173,
    open: false,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
}));
