const app = require('./app');
const config = require('./src/config');
const { connectDB, disconnectDB } = require('./src/config/db');
const { seedDatabase } = require('./src/utils/seeder');

async function startServer() {
  try {
    console.log('[Server] Initializing QuickFile Backend...');

    // 1. Connect to MongoDB
    await connectDB();

    // 2. Run initial seeder (ensures default PIN, admin, staff, citizen, and types exist)
    await seedDatabase();

    // 3. Start listening for HTTP requests
    const server = app.listen(config.port, () => {
      console.log(`[Server] QuickFile API listening on port ${config.port} (${config.nodeEnv})`);
      console.log(`[Server] Health check: http://localhost:${config.port}/api/health`);
    });

    // Graceful shutdown handling
    const shutdown = async (signal) => {
      console.log(`\n[Server] Received ${signal}. Initiating graceful shutdown...`);
      server.close(async () => {
        console.log('[Server] HTTP server closed.');
        await disconnectDB();
        process.exit(0);
      });

      // Force close if graceful shutdown takes too long
      setTimeout(() => {
        console.error('[Server] Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('[Server] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
