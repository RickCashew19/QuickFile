const app = require('./app');
const { config, validateConfig } = require('./src/config');
const { API_PREFIX } = require('./src/config/constants');
const { connectDB, disconnectDB } = require('./src/config/db');
const { seedDatabase } = require('./src/utils/seeder');

async function startServer() {
  try {
    console.log('[Server] Initializing QuickFile Backend...');

    // Requirement 1: Validate SU_ADMIN_KEY on startup. Halt if missing.
    validateConfig();

    // 1. Connect to MongoDB
    await connectDB();

    // 2. Run initial seeder
    await seedDatabase();

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
