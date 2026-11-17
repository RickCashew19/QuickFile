const app = require('./app');
const { config, validateConfig } = require('./src/config');
const { API_PREFIX, ROLES } = require('./src/config/constants');
const { connectDB, disconnectDB } = require('./src/config/db');
const { User } = require('./src/models');

async function startServer() {
  try {
    console.log('[Server] Initializing QuickFile Backend...');

    // Validate environment invariants on startup. Halt if missing.
    validateConfig();

    if (config.isProduction && !process.env.RATE_LIMIT_REDIS_URL) {
      console.warn(
        '[Server] Rate limits use the default in-memory store (single process only). ' +
          'For multi-instance deployments, configure RATE_LIMIT_REDIS_URL and a shared store.'
      );
    }

    // 1. Connect to MongoDB
    await connectDB();

    // 2. Check for administrative accounts (server does NOT seed accounts at startup)
    const adminCount = await User.countDocuments({ role: ROLES.ADMIN });
    if (adminCount === 0) {
      console.warn(
        '[Server] Warning: No administrator account exists in database. Run "npm run seed" to initialize default administrative accounts.'
      );
    }

    // 3. Start listening for HTTP requests
    const server = app.listen(config.port, () => {
      console.log(`[Server] QuickFile API listening on port ${config.port} (${config.nodeEnv})`);
      console.log(`[Server] Health check: http://localhost:${config.port}${API_PREFIX}/health`);
    });

    const shutdown = async (signal) => {
      console.log(`\n[Server] Received ${signal}. Initiating graceful shutdown...`);
      server.close(async () => {
        console.log('[Server] HTTP server closed.');
        await disconnectDB();
        process.exit(0);
      });

      setTimeout(() => {
        console.error('[Server] Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('[Server] Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
