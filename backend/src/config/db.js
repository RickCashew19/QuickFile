const mongoose = require('mongoose');
const { config } = require('./index');

let isConnected = false;

// Register event listeners once at module load time to prevent stacking on repeated connectDB() calls
mongoose.connection.on('connected', () => {
  isConnected = true;
  const host = mongoose.connection.host || 'cluster';
  console.log(`[MongoDB] MongoDB connected: ${host}`);
});

mongoose.connection.on('error', (err) => {
  console.error(`[MongoDB] Connection error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('[MongoDB] Disconnected from database.');
});

async function connectDB(customUri = null) {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const uri = customUri || config.mongoUri || process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!uri) {
    throw new Error('[MongoDB] Fatal Error: MongoDB connection URI is missing.');
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      autoIndex: config.nodeEnv !== 'production',
      dbName: 'quickfile',
    });
    return mongoose.connection;
  } catch (error) {
    console.error(`[MongoDB] Initial connection failed: ${error.message}`);
    throw error;
  }
}

async function disconnectDB() {
  if (isConnected || mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[MongoDB] Connection closed successfully.');
  }
}

// Graceful termination handling for process signals
process.on('SIGINT', async () => {
  await disconnectDB();
});

process.on('SIGTERM', async () => {
  await disconnectDB();
});

module.exports = {
  connectDB,
  disconnectDB,
};
