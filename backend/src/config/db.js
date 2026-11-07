const mongoose = require('mongoose');
const { config } = require('./index');

let isConnected = false;

async function connectDB(customUri = null) {
  if (isConnected) {
    return mongoose.connection;
  }

  mongoose.connection.on('connected', () => {
    isConnected = true;
    console.log(`[MongoDB] Connected to database: ${mongoose.connection.name}`);
  });

  mongoose.connection.on('error', (err) => {
    console.error(`[MongoDB] Connection error: ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('[MongoDB] Disconnected from database.');
  });

  const uri = customUri || process.env.MONGO_URI || config.mongoUri;

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: config.nodeEnv !== 'production',
    });
    return mongoose.connection;
  } catch (error) {
    console.error(`[MongoDB] Initial connection failed: ${error.message}`);
    throw error;
  }
}

async function disconnectDB() {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[MongoDB] Connection closed successfully.');
  }
}

module.exports = {
  connectDB,
  disconnectDB,
};
